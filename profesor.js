import { auth, db, configurado } from './firebase.js';
import { NOMBRE_APP } from './config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ref, get, set, update, remove, onValue, serverTimestamp, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { esc, TIPOS, nombreTipo, esActividad, esCorregible, itemPublico, comprobar, textoRespuesta, solucionTexto, generarCodigo, nuevoId, parseNum, fecha } from './lib.js';

const app = document.getElementById('app');
const dlg = document.getElementById('dlg');
const $ = s => app.querySelector(s);
let U = null;
let limpiar = [];
const alSalir = f => limpiar.push(f);
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICO = {
  arriba: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  abajo: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function reset() {
  limpiar.forEach(f => { try { f(); } catch {} });
  limpiar = [];
  document.onkeydown = null;
  document.body.classList.remove('modo-proyector');
  if (dlg.open) dlg.close();
}

function marco(html) {
  return `<header class="barra">
    <a class="marca" href="#/">${esc(NOMBRE_APP)}</a>
    <div class="usuario"><span>${esc(U?.displayName || U?.email || '')}</span><button class="btn peq" id="salir">Salir</button></div>
  </header><main class="contenido">${html}</main>`;
}

function enlaceAlumno(code) {
  const u = new URL('index.html', location.href);
  u.search = `?c=${code}`;
  u.hash = '';
  return u;
}
const enlaceCorto = u => (u.host + u.pathname).replace(/index\.html$/, '');

function estado(items, i) {
  const it = items[i];
  return { index: i, total: items.length, item: itemPublico(it), open: esActividad(it), reveal: false, updatedAt: serverTimestamp() };
}

// ── Acceso ───────────────────────────────────────────────────────
function pantallaLogin() {
  reset();
  app.innerHTML = `<section class="acceso">
    <h1>${esc(NOMBRE_APP)}</h1>
    <p>Prepara tus lecciones y dirige la clase desde aquí. El alumnado entra con su cuenta del colegio y el código de la clase.</p>
    <button class="btn primario grande" id="google">Entrar con Google</button>
    <p class="aviso" id="err" role="alert"></p></section>`;
  $('#google').onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { $('#err').textContent = `No se ha podido iniciar sesión (${e.code || e.message}). Si usas GitHub Pages, revisa que su dominio esté en los dominios autorizados de Firebase.`; }
  };
}

function pantallaSinPermiso(user) {
  reset();
  app.innerHTML = `<section class="acceso">
    <h1>Falta un paso</h1>
    <p>Has entrado como ${esc(user.email)}, pero esta cuenta aún no está autorizada como docente.</p>
    <p>En la consola de Firebase, abre Realtime Database, crea dentro de <code>teachers</code> una clave con este identificador y ponle el valor <code>true</code>:</p>
    <p class="uid"><code>${esc(user.uid)}</code> <button class="btn peq" id="copiar">Copiar</button></p>
    <p>Después, recarga esta página.</p>
    <button class="btn" id="salir">Usar otra cuenta</button></section>`;
  $('#copiar').onclick = () => navigator.clipboard?.writeText(user.uid).then(() => { $('#copiar').textContent = 'Copiado'; });
}

app.addEventListener('click', e => { if (e.target.closest('#salir')) signOut(auth); });

if (!configurado) {
  app.innerHTML = `<section class="acceso"><h1>Falta conectar Firebase</h1><p>Abre <code>config.js</code> y pega la configuración de tu proyecto de Firebase. En el archivo <code>LEEME.md</code> tienes los pasos.</p></section>`;
} else {
  onAuthStateChanged(auth, async user => {
    if (!user || user.isAnonymous) { U = null; return pantallaLogin(); }
    const t = await get(ref(db, `teachers/${user.uid}`)).catch(() => null);
    if (!t || t.val() !== true) return pantallaSinPermiso(user);
    U = user;
    router();
  });
  window.addEventListener('hashchange', () => { if (U) router(); });
}

function router() {
  reset();
  const [, ruta, id] = location.hash.split('/');
  if (ruta === 'leccion' && id) return vistaEditor(id);
  if (ruta === 'directo' && id) return vistaDirecto(id);
  if (ruta === 'proyectar' && id) return vistaProyector(id);
  if (ruta === 'informe' && id) return vistaInforme(id);
  return vistaInicio();
}

// ── Inicio: lecciones y clases recientes ─────────────────────────
function vistaInicio() {
  app.innerHTML = marco(`
  <section class="bloque">
    <div class="cab-bloque"><h1>Tus lecciones</h1><button class="btn primario" id="nueva">Nueva lección</button></div>
    <ul class="lista" id="lecciones"><li class="vacio">Cargando…</li></ul>
  </section>
  <section class="bloque">
    <h2>Clases recientes</h2>
    <ul class="lista" id="sesiones"><li class="vacio">Cargando…</li></ul>
  </section>`);

  $('#nueva').onclick = async () => {
    const id = nuevoId();
    await set(ref(db, `lessons/${U.uid}/${id}`), { title: 'Lección sin título', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    location.hash = `#/leccion/${id}`;
  };

  alSalir(onValue(ref(db, `lessons/${U.uid}`), snap => {
    const ul = $('#lecciones'); if (!ul) return;
    const ls = Object.entries(snap.val() || {}).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
    ul.innerHTML = ls.length ? ls.map(([id, l]) => {
      const its = l.items || [];
      const nd = its.filter(i => i.type === 'slide').length, na = its.length - nd;
      return `<li class="fila">
        <div class="fila-info"><a class="fila-titulo" href="#/leccion/${id}">${esc(l.title)}</a>
          <span class="meta">${nd} ${nd === 1 ? 'diapositiva' : 'diapositivas'} y ${na} ${na === 1 ? 'actividad' : 'actividades'}</span></div>
        <div class="fila-acc">
          <a class="btn peq" href="#/leccion/${id}">Editar</a>
          <button class="btn peq primario" data-empezar="${id}" ${its.length ? '' : 'disabled'}>Empezar clase</button>
          <button class="btn peq peligro" data-borrar="${id}">Eliminar</button>
        </div></li>`;
    }).join('') : `<li class="vacio">Aún no tienes lecciones. Crea una y sube tu presentación en PDF.</li>`;
  }));

  alSalir(onValue(query(ref(db, `teacherSessions/${U.uid}`), orderByChild('createdAt'), limitToLast(15)), snap => {
    const ul = $('#sesiones'); if (!ul) return;
    const ss = [];
    snap.forEach(c => { ss.push([c.key, c.val()]); });
    ss.reverse();
    ul.innerHTML = ss.length ? ss.map(([code, s]) => `<li class="fila">
      <div class="fila-info"><span class="fila-titulo">${esc(s.lessonTitle)}</span>
        <span class="meta">${fecha(s.createdAt)}, código ${code}${s.endedAt ? '' : ', <strong class="en-curso">en curso</strong>'}</span></div>
      <div class="fila-acc">
        ${s.endedAt ? '' : `<a class="btn peq primario" href="#/directo/${code}">Volver al directo</a>`}
        <a class="btn peq" href="#/informe/${code}">Informe</a>
      </div></li>`).join('') : `<li class="vacio">Cuando des tu primera clase, aparecerá aquí con su informe.</li>`;
  }));

  $('.contenido') && (app.querySelector('.contenido').onclick = async e => {
    const emp = e.target.closest('[data-empezar]');
    if (emp) { emp.disabled = true; emp.textContent = 'Preparando…'; return empezarClase(emp.dataset.empezar); }
    const bor = e.target.closest('[data-borrar]');
    if (bor && confirm('¿Eliminar esta lección y sus diapositivas? Los informes de las clases ya dadas se conservan.')) {
      await remove(ref(db, `slides/${U.uid}/${bor.dataset.borrar}`));
      await remove(ref(db, `lessons/${U.uid}/${bor.dataset.borrar}`));
    }
  });
}

async function empezarClase(lessonId) {
  const l = (await get(ref(db, `lessons/${U.uid}/${lessonId}`))).val();
  const items = l?.items || [];
  if (!items.length) return alert('Esta lección aún no tiene diapositivas ni actividades.');
  let code;
  for (let i = 0; i < 10; i++) {
    code = generarCodigo();
    if (!(await get(ref(db, `sessions/${code}`))).exists()) break;
  }
  await set(ref(db, `teacherSessions/${U.uid}/${code}`), { lessonId, lessonTitle: l.title, createdAt: serverTimestamp(), items });
  await set(ref(db, `sessions/${code}`), { owner: U.uid, lessonId, lessonTitle: l.title, createdAt: serverTimestamp(), showCode: true, state: estado(items, 0) });
  location.hash = `#/directo/${code}`;
}

// ── Editor de lección ────────────────────────────────────────────
async function vistaEditor(id) {
  app.innerHTML = marco(`<p class="vacio">Cargando lección…</p>`);
  const lRef = ref(db, `lessons/${U.uid}/${id}`);
  const L = (await get(lRef)).val();
  if (!L) { app.innerHTML = marco(`<p class="vacio">Esa lección no existe. <a href="#/">Volver a tus lecciones</a></p>`); return; }
  let items = L.items || [];
  const diapos = (await get(ref(db, `slides/${U.uid}/${id}`))).val() || {};
  const guardar = () => update(lRef, { items, updatedAt: serverTimestamp() });

  function fila(it, i) {
    const mini = it.type === 'slide'
      ? (diapos[it.page] ? `<img src="${diapos[it.page]}" alt="">` : '')
      : `<span class="mini-act">${nombreTipo(it)}</span>`;
    let meta = '';
    if (it.type === 'quiz') meta = `${it.options.length} opciones`;
    if (it.type === 'number') meta = `Solución ${solucionTexto(it)}, tolerancia ${it.tolerance}%`;
    if (it.type === 'short') meta = esCorregible(it) ? 'Se corrige sola' : 'Corrección manual';
    if (it.type === 'draw') meta = it.background ? `Sobre la diapositiva ${it.background}` : 'Lienzo en blanco';
    return `<li class="item ${it.type === 'slide' ? 'es-diapo' : 'es-act'}">
      <div class="miniatura">${mini}</div>
      <div class="info"><strong>${it.type === 'slide' ? `Diapositiva ${it.page}` : esc(it.prompt)}</strong>${meta ? `<span class="meta">${esc(meta)}</span>` : ''}</div>
      <div class="botones">
        <button class="btn-ico" data-up="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${ICO.arriba}</button>
        <button class="btn-ico" data-down="${i}" aria-label="Bajar" ${i === items.length - 1 ? 'disabled' : ''}>${ICO.abajo}</button>
        ${esActividad(it) ? `<button class="btn peq" data-edit="${i}">Editar</button>` : ''}
        <button class="btn peq" data-add="${i}">Añadir actividad debajo</button>
        <button class="btn peq peligro" data-del="${i}">Quitar</button>
      </div></li>`;
  }

  function pintar() {
    app.innerHTML = marco(`
    <section class="editor">
      <div class="cab-editor">
        <input id="titulo" class="titulo-input" value="${esc(L.title)}" aria-label="Título de la lección" maxlength="120">
        <div class="acciones">
          <label class="btn">${Object.keys(diapos).length ? 'Reemplazar PDF' : 'Subir PDF'}<input type="file" id="pdf" accept="application/pdf" hidden></label>
          <button class="btn primario" id="empezar" ${items.length ? '' : 'disabled'}>Empezar clase</button>
        </div>
      </div>
      <p class="ayuda" id="progreso" aria-live="polite">${items.length ? 'Ordena las diapositivas y añade actividades donde quieras que la clase participe.' : 'Sube tu presentación en PDF. Si la tienes en PowerPoint o Google Slides, expórtala antes como PDF.'}</p>
      <ol class="items" id="items">${items.map(fila).join('')}</ol>
      <button class="btn" data-add="${items.length - 1}">Añadir actividad al final</button>
    </section>`);

    $('#titulo').onchange = e => { L.title = e.target.value.trim() || 'Lección sin título'; update(lRef, { title: L.title, updatedAt: serverTimestamp() }); };
    $('#pdf').onchange = e => { const f = e.target.files[0]; if (f) procesarPDF(f); };
    $('#empezar').onclick = e => { e.target.disabled = true; empezarClase(id); };
    app.querySelector('.editor').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.up) { const i = +d.up; [items[i - 1], items[i]] = [items[i], items[i - 1]]; guardar(); pintar(); }
      if (d.down) { const i = +d.down; [items[i + 1], items[i]] = [items[i], items[i + 1]]; guardar(); pintar(); }
      if (d.del) {
        const i = +d.del;
        const msg = items[i].type === 'slide' ? '¿Quitar esta diapositiva de la lección?' : '¿Eliminar esta actividad?';
        if (confirm(msg)) { items.splice(i, 1); guardar(); pintar(); }
      }
      if (d.edit) { const i = +d.edit; dialogoActividad(items[i], paginas(), nuevo => { items[i] = nuevo; guardar(); pintar(); }); }
      if (d.add !== undefined) { const i = +d.add; dialogoActividad(null, paginas(), nuevo => { items.splice(i + 1, 0, nuevo); guardar(); pintar(); }); }
    };
  }

  const paginas = () => Object.keys(diapos).filter(k => diapos[k]).map(Number).sort((a, b) => a - b);

  async function procesarPDF(file) {
    const hayDiapos = items.some(i => i.type === 'slide');
    if (hayDiapos && !confirm('Se reemplazarán las imágenes de las diapositivas. Tus actividades se mantienen donde están. ¿Continuar?')) return;
    const prog = $('#progreso');
    const botones = app.querySelectorAll('button, input');
    botones.forEach(b => b.disabled = true);
    try {
      const pdfjs = window.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const n = pdf.numPages;
      for (let p = 1; p <= n; p++) {
        prog.textContent = `Procesando página ${p} de ${n}…`;
        const page = await pdf.getPage(p);
        const v1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(2.5, 1600 / v1.width) });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const url = c.toDataURL('image/jpeg', 0.75);
        await set(ref(db, `slides/${U.uid}/${id}/${p}`), url);
        diapos[p] = url;
      }
      for (const k of Object.keys(diapos)) if (Number(k) > n) { await remove(ref(db, `slides/${U.uid}/${id}/${k}`)); delete diapos[k]; }
      const existentes = new Set(items.filter(i => i.type === 'slide').map(i => i.page));
      items = items.filter(it => it.type !== 'slide' || it.page <= n);
      for (let p = 1; p <= n; p++) if (!existentes.has(p)) items.push({ id: nuevoId(), type: 'slide', page: p });
      await update(lRef, { pageCount: n });
      await guardar();
      pintar();
      $('#progreso').textContent = `Listo: ${n} ${n === 1 ? 'página cargada' : 'páginas cargadas'}. Ahora puedes añadir actividades.`;
    } catch (e) {
      console.error(e);
      pintar();
      $('#progreso').textContent = 'No se ha podido procesar el PDF. Comprueba que no esté protegido con contraseña e inténtalo de nuevo.';
    }
  }

  pintar();
}

// ── Diálogo de actividad ─────────────────────────────────────────
const DESCRIPCION = {
  quiz: 'Varias opciones, con o sin respuesta correcta',
  short: 'El alumnado escribe un texto breve',
  number: 'Un valor numérico, con unidad y tolerancia',
  draw: 'Dibujan en blanco o sobre una diapositiva'
};

function dialogoActividad(item, paginas, alGuardar) {
  function elegirTipo() {
    dlg.innerHTML = `<form method="dialog" class="dlg">
      <h2>Nueva actividad</h2>
      <div class="tipos">${['quiz', 'short', 'number', 'draw'].map(t => `<button type="button" class="tipo-btn" data-t="${t}"><strong>${TIPOS[t]}</strong><span>${DESCRIPCION[t]}</span></button>`).join('')}</div>
      <div class="pie"><button class="btn" value="cancel">Cancelar</button></div></form>`;
    dlg.querySelectorAll('[data-t]').forEach(b => b.onclick = () => formularioTipo({ type: b.dataset.t }));
  }

  function filaOp(texto, i, marcada) {
    return `<div class="op"><input type="radio" name="correcta" ${marcada ? 'checked' : ''} aria-label="Marcar como correcta">
      <input class="op-txt" value="${esc(texto)}" placeholder="Opción ${i + 1}" maxlength="200">
      <button type="button" class="btn-ico" data-quitar aria-label="Quitar opción">×</button></div>`;
  }

  function formularioTipo(base) {
    const t = base.type;
    let campos = '';
    if (t === 'quiz') {
      const ops = base.options?.length ? base.options : ['', ''];
      campos = `<fieldset class="opciones"><legend>Opciones (marca la correcta)</legend>
        <div id="ops">${ops.map((o, i) => filaOp(o, i, !base.poll && Number(base.correct) === i)).join('')}</div>
        <button type="button" class="btn peq" id="addop">Añadir opción</button></fieldset>
        <label class="check"><input type="checkbox" id="encuesta" ${base.poll ? 'checked' : ''}> Es una encuesta: no hay respuesta correcta</label>`;
    }
    if (t === 'short') {
      campos = `<label>Respuestas válidas (opcional)
        <input id="aceptadas" value="${esc(base.accepted || '')}" placeholder="Por ejemplo: evaporación; vaporización">
        <span class="ayuda">Sepáralas con punto y coma. Si las indicas, se corrige sola sin tener en cuenta mayúsculas ni tildes.</span></label>`;
    }
    if (t === 'number') {
      campos = `<div class="rejilla-3">
        <label>Solución<input id="sol" inputmode="decimal" value="${esc(base.answer ?? '')}" placeholder="9,8"></label>
        <label>Tolerancia (%)<input id="tol" type="number" min="0" max="100" step="0.1" value="${esc(base.tolerance ?? 2)}"></label>
        <label>Unidad<input id="uni" value="${esc(base.unit || '')}" placeholder="m/s^2"></label></div>
        <label class="check"><input type="checkbox" id="pedir" ${base.unitMode === 'ask' ? 'checked' : ''}> El alumnado debe escribir la unidad (si no, la ve junto a la casilla)</label>`;
    }
    if (t === 'draw') {
      campos = `<label>Fondo<select id="fondo"><option value="">Lienzo en blanco</option>${paginas.map(p => `<option value="${p}" ${Number(base.background) === p ? 'selected' : ''}>Diapositiva ${p}</option>`).join('')}</select></label>`;
    }

    dlg.innerHTML = `<form method="dialog" class="dlg">
      <h2>${item ? 'Editar' : 'Nueva'} actividad: ${TIPOS[t]}</h2>
      <label>Enunciado<textarea id="enun" rows="3" maxlength="500" required>${esc(base.prompt || '')}</textarea></label>
      ${campos}
      <p class="aviso" id="err" role="alert"></p>
      <div class="pie"><button class="btn" value="cancel">Cancelar</button><button type="button" class="btn primario" id="ok">Guardar actividad</button></div></form>`;

    const q = s => dlg.querySelector(s);
    if (t === 'quiz') {
      q('#addop').onclick = () => {
        const n = q('#ops').children.length;
        if (n >= 6) return;
        q('#ops').insertAdjacentHTML('beforeend', filaOp('', n, false));
      };
      q('#ops').onclick = e => { if (e.target.closest('[data-quitar]') && q('#ops').children.length > 2) e.target.closest('.op').remove(); };
    }

    q('#ok').onclick = () => {
      const err = m => { q('#err').textContent = m; };
      const prompt = q('#enun').value.trim();
      if (!prompt) return err('Escribe el enunciado.');
      const out = { id: base.id || nuevoId(), type: t, prompt };
      if (t === 'quiz') {
        const filas = [...q('#ops').children];
        out.options = filas.map(f => f.querySelector('.op-txt').value.trim());
        if (out.options.some(o => !o)) return err('Rellena todas las opciones o quita las que sobren.');
        out.poll = q('#encuesta').checked;
        if (!out.poll) {
          const c = filas.findIndex(f => f.querySelector('[type=radio]').checked);
          if (c < 0) return err('Marca la opción correcta, o indica que es una encuesta.');
          out.correct = c;
        }
      }
      if (t === 'short') { const a = q('#aceptadas').value.trim(); if (a) out.accepted = a; }
      if (t === 'number') {
        const sol = parseNum(q('#sol').value);
        if (Number.isNaN(sol)) return err('La solución debe ser un número. Puedes usar coma decimal y 3e4 o 3·10^4.');
        out.answer = sol;
        out.tolerance = Math.max(0, Number(q('#tol').value) || 0);
        const u = q('#uni').value.trim(); if (u) out.unit = u;
        out.unitMode = q('#pedir').checked && u ? 'ask' : 'show';
      }
      if (t === 'draw') { const f = q('#fondo').value; if (f) out.background = Number(f); }
      dlg.close();
      alGuardar(out);
    };
    if (!dlg.open) dlg.showModal();
  }

  if (item) formularioTipo(item); else elegirTipo();
  if (!dlg.open) dlg.showModal();
}

// ── Resultados (compartido por control y proyector) ──────────────
function agregados(it, resp) {
  const rs = Object.values(resp || {});
  if (it.type === 'quiz') return { counts: it.options.map((_, i) => rs.filter(r => Number(r.value) === i).length) };
  return { total: rs.length, ok: rs.filter(r => comprobar(it, r.value) === true).length };
}

function resultadosHTML(it, resp, { vista, revelado = false }) {
  const entradas = Object.entries(resp || {}).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  const n = entradas.length;
  const cab = `<p class="recuento"><strong>${n}</strong> ${n === 1 ? 'respuesta' : 'respuestas'}</p>`;
  const detalle = vista === 'profesor' || revelado;
  const conNombre = vista === 'profesor';

  if (it.type === 'quiz') {
    const counts = agregados(it, resp).counts;
    return cab + `<ul class="barras">${it.options.map((o, i) => {
      const p = n ? Math.round(counts[i] * 100 / n) : 0;
      const ok = !it.poll && detalle && i === Number(it.correct);
      return `<li class="barra-op ${ok ? 'correcta' : ''}"><span class="op-texto">${esc(o)}${ok ? ' <span class="marca-ok">correcta</span>' : ''}</span>
        ${detalle ? `<span class="op-n">${counts[i]}</span><span class="op-barra"><span style="width:${p}%"></span></span>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  if (!detalle) return cab;
  if (it.type === 'draw') {
    return cab + `<div class="galeria">${entradas.map(([, r]) => `<figure><button type="button" class="ver-dibujo" data-src="${esc(r.value)}"><img src="${esc(r.value)}" alt="Dibujo${conNombre ? ' de ' + esc(r.alias) : ''}" loading="lazy"></button>${conNombre ? `<figcaption>${esc(r.alias)}</figcaption>` : ''}</figure>`).join('')}</div>`;
  }
  const ag = agregados(it, resp);
  const resumen = esCorregible(it)
    ? `<p class="resumen-ok">${ag.ok} de ${n} ${n === 1 ? 'correcta' : 'correctas'}${it.type === 'number' ? `. Solución: ${esc(solucionTexto(it))}` : ''}</p>` : '';
  return cab + resumen + `<ul class="respuestas">${entradas.map(([, r]) => {
    const ok = comprobar(it, r.value);
    return `<li class="${ok === true ? 'ok' : ok === false ? 'mal' : ''}">${conNombre ? `<span class="quien">${esc(r.alias)}</span>` : ''}<span class="que">${esc(textoRespuesta(it, r.value))}</span></li>`;
  }).join('')}</ul>`;
}

function verDibujo(src) {
  dlg.innerHTML = `<form method="dialog" class="dlg dlg-ancho"><img class="dibujo-grande" src="${esc(src)}" alt="Dibujo ampliado"><div class="pie"><button class="btn">Cerrar</button></div></form>`;
  dlg.showModal();
}

// Lógica de navegación común a control y proyector
function controlSesion(code, items, alCambiar) {
  let ses = null, resp = {}, itemSub = null, itemId = null;
  const idx = () => ses?.state?.index ?? 0;
  const ir = i => {
    if (!ses || ses.endedAt || i < 0 || i >= items.length) return;
    set(ref(db, `sessions/${code}/state`), estado(items, i));
  };
  const sincronizar = () => {
    const st = ses?.state; if (!st?.reveal) return;
    const it = items[idx()]; if (!esActividad(it)) return;
    const ag = agregados(it, resp);
    if (JSON.stringify(ag) !== JSON.stringify(st.results || null)) set(ref(db, `sessions/${code}/state/results`), ag);
  };
  alSalir(onValue(ref(db, `sessions/${code}`), s => {
    ses = s.val(); if (!ses) return;
    const it = items[idx()];
    const nid = esActividad(it) ? it.id : null;
    if (nid !== itemId) {
      itemId = nid;
      if (itemSub) itemSub();
      itemSub = null; resp = {};
      if (nid) itemSub = onValue(ref(db, `responses/${code}/${nid}`), r => { resp = r.val() || {}; sincronizar(); alCambiar('resp'); });
    }
    alCambiar('sesion');
  }));
  alSalir(() => itemSub && itemSub());
  document.onkeydown = e => {
    if (e.target.closest('input, textarea, select') || dlg.open) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); ir(idx() + 1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); ir(idx() - 1); }
  };
  return {
    get ses() { return ses; }, get resp() { return resp; }, idx, ir,
    abrir: () => update(ref(db, `sessions/${code}/state`), { open: !ses.state.open }),
    revelar: () => {
      const it = items[idx()];
      if (ses.state.reveal) update(ref(db, `sessions/${code}/state`), { reveal: false, item: itemPublico(it), results: null });
      else update(ref(db, `sessions/${code}/state`), { reveal: true, item: it, results: agregados(it, resp) });
    }
  };
}

// ── Control en directo ───────────────────────────────────────────
async function vistaDirecto(code) {
  app.innerHTML = marco(`<p class="vacio">Cargando clase…</p>`);
  const priv = (await get(ref(db, `teacherSessions/${U.uid}/${code}`))).val();
  if (!priv) { app.innerHTML = marco(`<p class="vacio">No encuentro esa clase. <a href="#/">Volver</a></p>`); return; }
  const items = priv.items || [];
  const diapos = (await get(ref(db, `slides/${U.uid}/${priv.lessonId}`))).val() || {};
  const enlace = enlaceAlumno(code);
  let roster = {};

  app.innerHTML = marco(`
  <section class="directo">
    <div class="cab-directo">
      <div class="cab-titulo"><h1>${esc(priv.lessonTitle)}</h1>
        <p class="meta">El alumnado entra en <a href="${enlace}" target="_blank" rel="noopener">${esc(enlaceCorto(enlace))}</a> con el código</p></div>
      <div class="codigo-grande" aria-label="Código de la clase">${code}</div>
      <div class="acciones">
        <button class="btn" id="vercodigo">Código en el proyector</button>
        <a class="btn" href="#/proyectar/${code}" target="_blank" rel="noopener">Abrir vista para proyectar</a>
        <a class="btn" href="#/informe/${code}">Informe</a>
        <button class="btn peligro" id="finalizar">Finalizar clase</button>
      </div>
    </div>
    <div class="directo-cuerpo">
      <div class="principal">
        <div class="vista-actual" id="actual"></div>
        <div class="controles" id="controles"></div>
      </div>
      <aside class="alumnado"><h2 id="cont-alumnos">Alumnado</h2><ul id="roster" class="roster"></ul></aside>
    </div>
    <ol class="tira" id="tira" aria-label="Recorrido de la lección"></ol>
  </section>`);

  const C = controlSesion(code, items, motivo => {
    if (motivo === 'sesion') { pintarControles(); pintarTira(); }
    pintarActual(); pintarRoster();
  });

  function pintarActual() {
    const el = $('#actual'); if (!el || !C.ses) return;
    const it = items[C.idx()]; if (!it) return;
    if (it.type === 'slide') {
      if (el.dataset.k === it.id) return;
      el.dataset.k = it.id;
      el.innerHTML = diapos[it.page] ? `<img class="diapo" src="${diapos[it.page]}" alt="Diapositiva ${it.page}">` : `<p class="vacio">La diapositiva ${it.page} no tiene imagen.</p>`;
      return;
    }
    el.dataset.k = '';
    const st = C.ses.state || {};
    el.innerHTML = `<div class="act-prof">
      <p class="tipo">${nombreTipo(it)}${st.open ? ' <span class="etiqueta abierta">abierta</span>' : ' <span class="etiqueta">cerrada</span>'}${st.reveal ? ' <span class="etiqueta">resultados visibles</span>' : ''}</p>
      <h2 class="enunciado">${esc(it.prompt)}</h2>${resultadosHTML(it, C.resp, { vista: 'profesor' })}</div>`;
  }

  function pintarControles() {
    const el = $('#controles'); if (!el || !C.ses) return;
    const i = C.idx(), it = items[i], st = C.ses.state || {}, fin = !!C.ses.endedAt;
    el.innerHTML = `
      <button class="btn" data-ir="${i - 1}" ${i === 0 || fin ? 'disabled' : ''}>Anterior</button>
      <span class="posicion">${i + 1} de ${items.length}</span>
      <button class="btn primario" data-ir="${i + 1}" ${i >= items.length - 1 || fin ? 'disabled' : ''}>Siguiente</button>
      ${esActividad(it) && !fin ? `<span class="sep" aria-hidden="true"></span>
        <button class="btn" id="abrir">${st.open ? 'Cerrar respuestas' : 'Abrir respuestas'}</button>
        <button class="btn" id="revelar">${st.reveal ? 'Ocultar resultados' : 'Mostrar resultados a la clase'}</button>` : ''}
      ${fin ? '<span class="etiqueta">Clase finalizada</span>' : ''}`;
    $('#vercodigo').textContent = C.ses.showCode ? 'Ocultar código en el proyector' : 'Mostrar código en el proyector';
  }

  function pintarRoster() {
    const ul = $('#roster'); if (!ul) return;
    const it = items[C.idx()], act = esActividad(it);
    const lista = Object.entries(roster).sort((a, b) => String(a[1].alias).localeCompare(String(b[1].alias), 'es'));
    const on = lista.filter(([, r]) => r.online).length;
    const nr = act ? Object.keys(C.resp).length : 0;
    $('#cont-alumnos').textContent = act ? `${on} ${on === 1 ? 'conectado' : 'conectados'}, ${nr} ${nr === 1 ? 'ha respondido' : 'han respondido'}` : `${on} ${on === 1 ? 'conectado' : 'conectados'}`;
    ul.innerHTML = lista.length ? lista.map(([u, r]) => {
      const est = !r.online ? 'fuera' : (r.away ? 'distraido' : 'dentro');
      const txt = { fuera: 'Desconectado', distraido: 'Ha salido de la pestaña', dentro: 'Conectado' }[est];
      return `<li class="alumno ${est}"><span class="punto" title="${txt}"></span><span class="sr">${txt}: </span>
        <span class="alias" title="${esc(r.email || '')}">${esc(r.alias)}</span>
        ${act && C.resp[u] ? '<span class="respondido">Respondido</span>' : ''}
        ${r.awayCount ? `<span class="salidas" title="Veces que ha salido de la pestaña">${r.awayCount}</span>` : ''}</li>`;
    }).join('') : `<li class="vacio">Nadie ha entrado todavía. Proyecta el código para que se unan.</li>`;
  }

  function pintarTira() {
    const el = $('#tira'); if (!el) return;
    const i = C.idx();
    if (!el.dataset.hecha) {
      el.dataset.hecha = '1';
      el.innerHTML = items.map((it, k) => `<li><button type="button" data-ir="${k}" aria-label="Ir al paso ${k + 1}">
        ${it.type === 'slide' ? (diapos[it.page] ? `<img src="${diapos[it.page]}" alt="">` : '') : `<span class="tira-act">${nombreTipo(it)}</span>`}
        <span class="tira-n">${k + 1}</span></button></li>`).join('');
    }
    [...el.children].forEach((li, k) => li.classList.toggle('actual', k === i));
    el.children[i]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: sinMovimiento ? 'auto' : 'smooth' });
  }

  alSalir(onValue(ref(db, `roster/${code}`), s => { roster = s.val() || {}; pintarRoster(); }));

  app.querySelector('.directo').onclick = async e => {
    const irB = e.target.closest('[data-ir]'); if (irB) return C.ir(Number(irB.dataset.ir));
    if (e.target.closest('#abrir')) return C.abrir();
    if (e.target.closest('#revelar')) return C.revelar();
    const vd = e.target.closest('.ver-dibujo'); if (vd) return verDibujo(vd.dataset.src);
    if (e.target.closest('#vercodigo')) return update(ref(db, `sessions/${code}`), { showCode: !C.ses.showCode });
    if (e.target.closest('#finalizar')) {
      if (!confirm('¿Finalizar la clase? El alumnado verá que ha terminado y ya no podrá responder.')) return;
      await update(ref(db, `sessions/${code}`), { endedAt: serverTimestamp(), 'state/open': false });
      await update(ref(db, `teacherSessions/${U.uid}/${code}`), { endedAt: serverTimestamp() });
      location.hash = `#/informe/${code}`;
    }
  };
}

// ── Vista para proyectar ─────────────────────────────────────────
async function vistaProyector(code) {
  document.body.classList.add('modo-proyector');
  app.innerHTML = `<p class="vacio">Cargando…</p>`;
  const priv = (await get(ref(db, `teacherSessions/${U.uid}/${code}`))).val();
  if (!priv) { app.innerHTML = `<p class="vacio">No encuentro esa clase.</p>`; return; }
  const items = priv.items || [];
  const diapos = (await get(ref(db, `slides/${U.uid}/${priv.lessonId}`))).val() || {};
  const enlace = enlaceAlumno(code);

  app.innerHTML = `<div class="proyector">
    <div class="proy-escena" id="escena"></div>
    <div class="proy-banda" id="banda" hidden>
      <div class="proy-qr" id="qr" aria-hidden="true"></div>
      <div class="proy-texto">Entra en <strong>${esc(enlaceCorto(enlace))}</strong><br>con el código</div>
      <div class="proy-codigo">${code}</div>
    </div>
    <button class="proy-pc btn peq" id="pc">Pantalla completa</button>
  </div>`;
  if (window.QRCode) new window.QRCode($('#qr'), { text: String(enlace), width: 132, height: 132, colorDark: '#15313b', colorLight: '#ffffff' });
  $('#pc').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  app.querySelector('.proyector').onclick = e => { const vd = e.target.closest('.ver-dibujo'); if (vd) verDibujo(vd.dataset.src); };

  const C = controlSesion(code, items, () => pintar());
  function pintar() {
    const ses = C.ses; if (!ses) return;
    $('#banda').hidden = !ses.showCode || !!ses.endedAt;
    const el = $('#escena');
    if (ses.endedAt) { el.dataset.k = 'fin'; el.innerHTML = `<p class="proy-fin">Clase finalizada</p>`; return; }
    const it = items[C.idx()]; if (!it) return;
    if (it.type === 'slide') {
      if (el.dataset.k === it.id) return;
      el.dataset.k = it.id;
      el.innerHTML = diapos[it.page] ? `<img src="${diapos[it.page]}" alt="Diapositiva ${it.page}">` : '';
      return;
    }
    el.dataset.k = '';
    el.innerHTML = `<div class="proy-act"><h2>${esc(it.prompt)}</h2>${resultadosHTML(it, C.resp, { vista: 'proyector', revelado: !!ses.state?.reveal })}</div>`;
  }
}

// ── Informe ──────────────────────────────────────────────────────
async function vistaInforme(code) {
  app.innerHTML = marco(`<p class="vacio">Cargando informe…</p>`);
  const [pS, rS, qS] = await Promise.all([
    get(ref(db, `teacherSessions/${U.uid}/${code}`)), get(ref(db, `roster/${code}`)), get(ref(db, `responses/${code}`))
  ]);
  const priv = pS.val();
  if (!priv) { app.innerHTML = marco(`<p class="vacio">No encuentro esa clase. <a href="#/">Volver</a></p>`); return; }
  const roster = rS.val() || {}, resp = qS.val() || {};
  const acts = (priv.items || []).filter(esActividad);
  const nCorr = acts.filter(esCorregible).length;

  const filas = Object.entries(roster)
    .sort((a, b) => String(a[1].alias).localeCompare(String(b[1].alias), 'es'))
    .map(([u, r]) => {
      let ok = 0;
      const celdas = acts.map(it => {
        const x = resp[it.id]?.[u];
        if (!x) return null;
        const c = comprobar(it, x.value);
        if (c === true) ok++;
        return { c, t: textoRespuesta(it, x.value), dibujo: it.type === 'draw' ? x.value : null };
      });
      return { r, celdas, ok };
    });
  const participacion = acts.map(it => Object.keys(resp[it.id] || {}).length);

  app.innerHTML = marco(`
  <section class="informe">
    <div class="cab-bloque">
      <div><h1>${esc(priv.lessonTitle)}</h1><p class="meta">${fecha(priv.createdAt)}, código ${code}, ${filas.length} ${filas.length === 1 ? 'alumno' : 'alumnos'}${priv.endedAt ? '' : ', <strong class="en-curso">en curso</strong>'}</p></div>
      <div class="acciones">
        ${priv.endedAt ? '' : `<a class="btn primario" href="#/directo/${code}">Volver al directo</a>`}
        <button class="btn" id="csv">Descargar CSV</button>
        <button class="btn" id="imprimir">Imprimir</button>
        <button class="btn peligro" id="borrar">Eliminar datos de esta clase</button>
      </div>
    </div>
    ${acts.length ? `<ol class="leyenda">${acts.map((it, k) => `<li><strong>A${k + 1}</strong> ${nombreTipo(it)}: ${esc(it.prompt)}</li>`).join('')}</ol>` : ''}
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th scope="col">Alumno</th><th scope="col">Correo</th><th scope="col">Entrada</th><th scope="col" title="Veces que salió de la pestaña durante la clase">Salidas</th>
        ${acts.map((it, k) => `<th scope="col" title="${esc(it.prompt)}">A${k + 1}</th>`).join('')}
        ${nCorr ? '<th scope="col">Aciertos</th>' : ''}</tr></thead>
      <tbody>${filas.map(f => `<tr>
        <th scope="row">${esc(f.r.alias)}</th><td>${esc(f.r.email || '')}</td><td>${fecha(f.r.joinedAt)}</td><td class="num">${f.r.awayCount || 0}</td>
        ${f.celdas.map(c => !c ? '<td class="sin">Sin respuesta</td>'
          : c.dibujo ? `<td><button class="btn peq ver-dibujo" data-src="${esc(c.dibujo)}">Ver dibujo</button></td>`
          : `<td class="${c.c === true ? 'ok' : c.c === false ? 'mal' : ''}">${esc(c.t)}</td>`).join('')}
        ${nCorr ? `<td class="num"><strong>${f.ok}</strong> de ${nCorr}</td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${5 + acts.length}" class="vacio">Nadie entró en esta clase.</td></tr>`}</tbody>
      ${filas.length && acts.length ? `<tfoot><tr><th scope="row">Han respondido</th><td></td><td></td><td></td>${participacion.map(n => `<td class="num">${n} de ${filas.length}</td>`).join('')}${nCorr ? '<td></td>' : ''}</tr></tfoot>` : ''}
    </table></div>
  </section>`);

  const sec = app.querySelector('.informe');
  sec.onclick = async e => {
    const vd = e.target.closest('.ver-dibujo'); if (vd) return verDibujo(vd.dataset.src);
    if (e.target.closest('#imprimir')) return window.print();
    if (e.target.closest('#csv')) return descargarCSV();
    if (e.target.closest('#borrar')) {
      if (!confirm('Se borrarán para siempre las respuestas, el registro de conexión y el informe de esta clase. La lección no se toca. ¿Continuar?')) return;
      await remove(ref(db, `roster/${code}`));
      await remove(ref(db, `responses/${code}`));
      await remove(ref(db, `sessions/${code}`));
      await remove(ref(db, `teacherSessions/${U.uid}/${code}`));
      location.hash = '#/';
    }
  };

  function descargarCSV() {
    // Evita que un alias como "=..." se interprete como fórmula en Excel
    const celda = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const cab = ['Alumno', 'Correo', 'Entrada', 'Salidas de la pestaña', ...acts.map((it, k) => `A${k + 1} ${nombreTipo(it)}: ${it.prompt}`), ...(nCorr ? [`Aciertos (de ${nCorr})`] : [])];
    const lineas = filas.map(f => [
      f.r.alias, f.r.email || '', fecha(f.r.joinedAt), f.r.awayCount || 0,
      ...f.celdas.map(c => !c ? '' : c.c === true ? `${c.t} (bien)` : c.c === false ? `${c.t} (mal)` : c.t),
      ...(nCorr ? [f.ok] : [])
    ]);
    const csv = '\ufeff' + [cab, ...lineas].map(l => l.map(celda).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `informe-${code}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
