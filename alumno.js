import { auth, db, configurado } from './firebase.js';
import { NOMBRE_APP, DOMINIO_ALUMNADO } from './config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ref, get, set, update, onValue, onDisconnect, serverTimestamp, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { esc, nombreTipo, comprobar, textoRespuesta, solucionTexto, esCorregible } from './lib.js';

const app = document.getElementById('app');
const S = { code: null, alias: '', uid: null, session: null, slides: {}, resp: null, respItem: null, respUnsub: null, key: '' };

const dominioOk = u => !!u && !u.isAnonymous && u.emailVerified && String(u.email || '').toLowerCase().endsWith('@' + DOMINIO_ALUMNADO);
const nombreVisible = u => (u.displayName || u.email.split('@')[0]).slice(0, 60);

async function iniciarSesion() {
  const prov = new GoogleAuthProvider();
  // Muestra directamente las cuentas del colegio en el selector de Google
  prov.setCustomParameters({ hd: DOMINIO_ALUMNADO, prompt: 'select_account' });
  await signInWithPopup(auth, prov);
}

// ── Pantalla de entrada ─────────────────────────────────────────
function pantallaEntrada(msg = '') {
  const code = (new URLSearchParams(location.search).get('c') || S.code || '').toUpperCase();
  const u = auth.currentUser;
  const conectado = dominioOk(u);
  app.innerHTML = `
  <section class="entrada">
    <p class="marca-texto">${esc(NOMBRE_APP)}</p>
    <h1>Entra en la clase</h1>
    ${conectado ? `
    <form id="f" class="formulario" autocomplete="off">
      <p class="cuenta">Has entrado como <strong>${esc(nombreVisible(u))}</strong><br><span class="meta">${esc(u.email)}</span>
        <button type="button" class="btn peq" id="otra">No soy yo</button></p>
      <label>Código de la clase
        <input id="code" class="codigo-input" maxlength="6" required value="${esc(code)}" autocapitalize="characters" spellcheck="false">
      </label>
      <p class="aviso" role="alert">${esc(msg)}</p>
      <button class="btn primario grande" type="submit">Entrar en la clase</button>
    </form>` : `
    <p>Inicia sesión con tu cuenta del colegio (<strong>@${esc(DOMINIO_ALUMNADO)}</strong>).</p>
    <p class="aviso" role="alert">${esc(msg)}</p>
    <button class="btn primario grande" id="google">Entrar con la cuenta del colegio</button>`}
  </section>`;

  if (!conectado) {
    app.querySelector('#google').onclick = async e => {
      e.target.disabled = true; e.target.textContent = 'Abriendo Google…';
      try { await iniciarSesion(); }
      catch (err) {
        console.error(err);
        const m = err.code === 'auth/popup-blocked' ? 'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes para esta web y vuelve a intentarlo.'
          : err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request' ? ''
          : 'No se ha podido iniciar sesión. Si el error se repite, avisa a tu profesor/a.';
        pantallaEntrada(m);
      }
    };
    return;
  }
  const f = app.querySelector('#f');
  const ci = f.querySelector('#code');
  ci.addEventListener('input', () => { ci.value = ci.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  f.querySelector('#otra').onclick = () => signOut(auth);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Entrando…';
    try { await entrar(ci.value); }
    catch (err) { console.error(err); pantallaEntrada('No se ha podido entrar. Comprueba tu conexión e inténtalo de nuevo.'); }
  });
}

async function entrar(code) {
  code = code.trim().toUpperCase();
  if (!code) return pantallaEntrada('Escribe el código de la clase.');
  const u = auth.currentUser;
  S.uid = u.uid;

  const snap = await get(ref(db, `sessions/${code}`));
  if (!snap.exists()) return pantallaEntrada('No hay ninguna clase con ese código. Revísalo en la pizarra.');
  if (snap.val().endedAt) return pantallaEntrada('Esa clase ya ha terminado.');

  S.code = code; S.alias = nombreVisible(u);
  const rRef = ref(db, `roster/${code}/${S.uid}`);
  const prev = await get(rRef);
  await update(rRef, {
    alias: S.alias, email: u.email.toLowerCase(), online: true, away: false, lastSeen: serverTimestamp(),
    ...(prev.exists() ? {} : { joinedAt: serverTimestamp(), awayCount: 0 })
  });
  history.replaceState(null, '', `?c=${code}`);
  presencia(rRef);
  onValue(ref(db, `sessions/${code}`), s => { S.session = s.val(); cambioSesion(); });
}

// ── Presencia y trazabilidad ─────────────────────────────────────
function presencia(rRef) {
  onValue(ref(db, '.info/connected'), s => {
    if (s.val() !== true || S.session?.endedAt) return;
    onDisconnect(rRef).update({ online: false, lastSeen: serverTimestamp() });
    update(rRef, { online: true, lastSeen: serverTimestamp() }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (!S.code || S.session?.endedAt) return;
    const away = document.hidden;
    update(rRef, { away, lastSeen: serverTimestamp() }).catch(() => {});
    if (away) runTransaction(ref(db, `roster/${S.code}/${S.uid}/awayCount`), n => (n || 0) + 1).catch(() => {});
  });
}

function cambioSesion() {
  const it = S.session?.state?.item;
  const id = it && it.type !== 'slide' ? it.id : null;
  if (id !== S.respItem) {
    if (S.respUnsub) S.respUnsub();
    S.respUnsub = null; S.resp = null; S.respItem = id; S.rehacer = false;
    if (id) S.respUnsub = onValue(ref(db, `responses/${S.code}/${id}/${S.uid}`), s => { S.resp = s.val(); pintar(); });
  }
  pintar();
}

async function diapo(page) {
  if (S.slides[page]) return S.slides[page];
  const s = await get(ref(db, `slides/${S.session.owner}/${S.session.lessonId}/${page}`));
  return (S.slides[page] = s.val());
}

// ── Vista en directo ─────────────────────────────────────────────
function pintar() {
  const ses = S.session;
  if (!ses || ses.endedAt) {
    if (S.key === 'fin') return; S.key = 'fin';
    app.innerHTML = `<section class="entrada"><h1>La clase ha terminado</h1><p>Gracias, ${esc(S.alias)}. Ya puedes cerrar esta página.</p></section>`;
    return;
  }
  const st = ses.state || {};
  const it = st.item;
  const key = [it?.id, st.open, st.reveal, JSON.stringify(S.resp?.value ?? null), JSON.stringify(st.results ?? null)].join('|');
  if (key === S.key) return;
  S.key = key;

  app.innerHTML = `
  <header class="barra-alumno">
    <span class="codigo-mini">${esc(S.code)}</span>
    <span class="yo">${esc(S.alias)}</span>
    <span class="pos">${it ? `${(st.index ?? 0) + 1} / ${st.total ?? ''}` : ''}</span>
  </header>
  <div class="escenario" id="esc"></div>`;
  const esc_ = app.querySelector('#esc');

  if (!it) { esc_.innerHTML = `<p class="espera">Esperando a que empiece la clase…</p>`; return; }
  if (it.type === 'slide') {
    esc_.innerHTML = `<img class="diapo" alt="Diapositiva ${it.page}">`;
    diapo(it.page).then(src => { const img = esc_.querySelector('img'); if (img && src) img.src = src; });
    return;
  }
  pintarActividad(esc_, it, st);
}

function pintarActividad(el, it, st) {
  const mia = S.resp?.value;
  const tieneMia = S.resp != null;
  let cuerpo = '';

  if (st.reveal) cuerpo = resultadoAlumno(it, st, mia, tieneMia);
  else if (!st.open) cuerpo = `<p class="estado-act">Las respuestas están cerradas.${tieneMia ? ` Tu respuesta: <strong>${esc(textoRespuesta(it, mia))}</strong>` : ''}</p>`;
  else cuerpo = formulario(it, mia, tieneMia);

  el.innerHTML = `<article class="actividad"><p class="tipo">${nombreTipo(it)}</p><h2 class="enunciado">${esc(it.prompt)}</h2>${cuerpo}</article>`;
  if (!st.reveal && st.open) activarFormulario(el, it, mia);
}

function formulario(it, mia, tieneMia) {
  const nota = tieneMia ? `<p class="estado-act ok">Respuesta enviada. Puedes cambiarla mientras siga abierta.</p>` : '';
  if (it.type === 'quiz') {
    return `<div class="opciones-alumno" role="radiogroup">${(it.options || []).map((o, i) =>
      `<button type="button" class="op-alumno ${Number(mia) === i && tieneMia ? 'elegida' : ''}" data-op="${i}" role="radio" aria-checked="${Number(mia) === i && tieneMia}">${esc(o)}</button>`).join('')}</div>${nota}`;
  }
  if (it.type === 'short') {
    return `<form class="form-resp"><textarea id="txt" rows="4" maxlength="1000" required placeholder="Escribe tu respuesta">${esc(mia ?? '')}</textarea><button class="btn primario grande">Enviar respuesta</button></form>${nota}`;
  }
  if (it.type === 'number') {
    const pedir = it.unitMode === 'ask';
    return `<form class="form-resp">
      <div class="fila-num">
        <input id="num" inputmode="decimal" required placeholder="Valor" value="${esc(mia?.n ?? '')}" aria-label="Valor numérico">
        ${pedir ? `<input id="uni" required placeholder="Unidad" value="${esc(mia?.u ?? '')}" aria-label="Unidad" class="uni">` : (it.unit ? `<span class="uni-fija">${esc(it.unit)}</span>` : '')}
      </div>
      <p class="ayuda">Puedes escribir decimales con coma y potencias así: 3,2·10^4 o 3,2e4.</p>
      <button class="btn primario grande">Enviar respuesta</button></form>${nota}`;
  }
  if (it.type === 'draw') {
    if (tieneMia && !S.rehacer) {
      return `<img class="dibujo-enviado" src="${esc(mia)}" alt="Tu dibujo">${nota}<button type="button" class="btn" id="rehacer">Volver a dibujar</button>`;
    }
    return `<div class="herramientas" id="herr">
        ${['#15313b', '#3490b0', '#ee712a', '#8d9200', '#c0392b'].map((c, i) => `<button type="button" class="color ${i === 0 ? 'activo' : ''}" data-color="${c}" style="--c:${c}" aria-label="Color ${i + 1}"></button>`).join('')}
        <button type="button" class="btn peq" data-grosor="3">Fino</button>
        <button type="button" class="btn peq" data-grosor="8">Grueso</button>
        <button type="button" class="btn peq" id="deshacer">Deshacer</button>
        <button type="button" class="btn peq" id="borrar">Borrar todo</button>
      </div>
      <div class="caja-lienzo" id="caja"></div>
      <button class="btn primario grande" id="enviar-dibujo">Enviar dibujo</button>${nota}
      <p class="aviso" id="aviso-d" role="alert"></p>`;
  }
  return '';
}

function activarFormulario(el, it, mia) {
  const enviar = async valor => {
    try {
      await set(ref(db, `responses/${S.code}/${it.id}/${S.uid}`), { value: valor, at: serverTimestamp(), alias: S.alias });
    } catch (e) {
      console.error(e);
      const p = el.querySelector('.aviso') || el.appendChild(Object.assign(document.createElement('p'), { className: 'aviso' }));
      p.textContent = 'No se ha podido enviar: puede que la actividad ya esté cerrada.';
    }
  };
  if (it.type === 'quiz') el.querySelectorAll('[data-op]').forEach(b => b.onclick = () => enviar(Number(b.dataset.op)));
  if (it.type === 'short') el.querySelector('form').onsubmit = e => { e.preventDefault(); const v = el.querySelector('#txt').value.trim(); if (v) enviar(v); };
  if (it.type === 'number') el.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const v = { n: el.querySelector('#num').value.trim() };
    const u = el.querySelector('#uni'); if (u) v.u = u.value.trim();
    if (v.n) enviar(v);
  };
  if (it.type === 'draw') {
    const re = el.querySelector('#rehacer');
    if (re) { re.onclick = () => { S.rehacer = true; S.key = ''; pintar(); }; return; }
    const caja = el.querySelector('#caja');
    const lz = crearLienzo(caja);
    if (it.background) diapo(it.background).then(src => src && lz.fondo(src));
    el.querySelector('#herr').onclick = e => {
      const c = e.target.closest('[data-color]');
      if (c) { lz.color = c.dataset.color; el.querySelectorAll('.color').forEach(x => x.classList.toggle('activo', x === c)); }
      const g = e.target.closest('[data-grosor]'); if (g) lz.grosor = Number(g.dataset.grosor);
      if (e.target.closest('#deshacer')) lz.deshacer();
      if (e.target.closest('#borrar')) lz.borrar();
    };
    el.querySelector('#enviar-dibujo').onclick = () => {
      if (lz.vacio()) { el.querySelector('#aviso-d').textContent = 'Dibuja algo antes de enviarlo.'; return; }
      S.rehacer = false;
      enviar(lz.exportar());
    };
  }
}

function resultadoAlumno(it, st, mia, tieneMia) {
  let html = '';
  if (it.type === 'quiz') {
    const counts = st.results?.counts || [];
    const total = counts.reduce((a, b) => a + b, 0);
    html += `<ul class="barras">${(it.options || []).map((o, i) => {
      const p = total ? Math.round((counts[i] || 0) * 100 / total) : 0;
      const ok = !it.poll && i === Number(it.correct);
      const yo = tieneMia && Number(mia) === i;
      return `<li class="barra-op ${ok ? 'correcta' : ''} ${yo ? 'mia' : ''}"><span class="op-texto">${esc(o)}${ok ? ' <span class="marca-ok">correcta</span>' : ''}${yo ? ' <span class="marca-yo">tu respuesta</span>' : ''}</span><span class="op-n">${p}%</span><span class="op-barra"><span style="width:${p}%"></span></span></li>`;
    }).join('')}</ul>`;
  } else if (it.type === 'number') {
    html += `<p class="solucion">Solución: <strong>${esc(solucionTexto(it))}</strong></p>`;
  } else if (it.type === 'short' && esCorregible(it)) {
    html += `<p class="solucion">Respuestas válidas: <strong>${esc(String(it.accepted).split(';').map(s => s.trim()).filter(Boolean).join(', '))}</strong></p>`;
  } else if (it.type === 'draw') {
    html += `<p class="estado-act">Tu profesor/a está comentando los dibujos en la pizarra.</p>`;
  }
  if (it.type !== 'quiz' && it.type !== 'draw') {
    if (tieneMia) {
      const ok = comprobar(it, mia);
      html += `<p class="tu-resp ${ok === true ? 'ok' : ok === false ? 'mal' : ''}">Tu respuesta: <strong>${esc(textoRespuesta(it, mia))}</strong>${ok === true ? '. Correcta.' : ok === false ? '. Revísala con la solución.' : ''}</p>`;
    } else html += `<p class="estado-act">No enviaste respuesta.</p>`;
  }
  return html;
}

// ── Lienzo de dibujo ─────────────────────────────────────────────
function crearLienzo(caja) {
  const cv = document.createElement('canvas');
  cv.className = 'lienzo';
  caja.appendChild(cv);
  const ctx = cv.getContext('2d');
  const trazos = [];
  let actual = null, img = null, ratio = 4 / 3, ancho = 0;
  const api = { color: '#15313b', grosor: 3 };

  function dibujar(c = ctx, W = cv.clientWidth, H = cv.clientHeight) {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    if (img) c.drawImage(img, 0, 0, W, H);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const t of trazos) {
      c.strokeStyle = t.c; c.lineWidth = t.g * W / 600;
      c.beginPath();
      t.p.forEach(([x, y], i) => i ? c.lineTo(x * W, y * H) : c.moveTo(x * W, y * H));
      if (t.p.length === 1) c.lineTo(t.p[0][0] * W + 0.5, t.p[0][1] * H);
      c.stroke();
    }
  }
  function medir() {
    const w = caja.clientWidth;
    if (!w) return;
    ancho = w;
    const h = w / ratio, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dibujar();
  }
  const punto = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); actual = { c: api.color, g: api.grosor, p: [punto(e)] }; trazos.push(actual); dibujar(); });
  cv.addEventListener('pointermove', e => { if (!actual) return; actual.p.push(punto(e)); dibujar(); });
  const fin = () => { actual = null; };
  cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
  new ResizeObserver(() => { if (caja.clientWidth !== ancho) medir(); }).observe(caja);
  medir();

  return Object.assign(api, {
    fondo(src) { img = new Image(); img.onload = () => { ratio = img.naturalWidth / img.naturalHeight; medir(); }; img.src = src; },
    deshacer() { trazos.pop(); dibujar(); },
    borrar() { trazos.length = 0; dibujar(); },
    vacio: () => trazos.length === 0,
    exportar() {
      const W = 900, H = Math.round(900 / ratio);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      dibujar(c.getContext('2d'), W, H);
      return c.toDataURL('image/jpeg', 0.72);
    }
  });
}

// ── Arranque ─────────────────────────────────────────────────────
if (!configurado) {
  app.innerHTML = `<section class="entrada"><h1>Falta configurar la aplicación</h1><p>Tu profesor/a todavía no ha conectado esta web con su base de datos.</p></section>`;
} else {
  onAuthStateChanged(auth, async u => {
    if (S.code) return; // ya está dentro de una clase
    if (u && !dominioOk(u)) {
      await signOut(auth);
      return pantallaEntrada(`Esa cuenta no es del colegio. Entra con tu cuenta @${DOMINIO_ALUMNADO}.`);
    }
    pantallaEntrada();
  });
}
