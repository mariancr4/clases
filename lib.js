// Utilidades compartidas por la vista del alumnado y la del profesorado

export const TIPOS = {
  slide: 'Diapositiva',
  quiz: 'Test',
  short: 'Respuesta abierta',
  number: 'Respuesta numérica',
  draw: 'Dibujo'
};

export const nombreTipo = it => (it?.type === 'quiz' && it.poll) ? 'Encuesta' : (TIPOS[it?.type] || '');
export const esActividad = it => !!it && it.type !== 'slide';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Lo que ve el alumnado mientras la actividad está abierta: sin soluciones
export function itemPublico(it) {
  if (!it) return null;
  const c = { ...it };
  delete c.correct; delete c.accepted; delete c.answer; delete c.tolerance;
  if (c.type === 'number' && c.unitMode === 'ask') delete c.unit;
  return c;
}

// Acepta 1,5 · 1.5 · 3e4 · 3·10^4 · 3x10^4 · 3×10^-4
export function parseNum(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/−/g, '-');
  const m = t.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(?:[x×·*]10\^?([+-]?\d+)|[eE]([+-]?\d+))?$/);
  if (!m) return NaN;
  const base = parseFloat(m[1]);
  const exp = m[2] ?? m[3];
  return exp != null ? base * 10 ** Number(exp) : base;
}

export function normUnidad(u) {
  return String(u ?? '').trim().replace(/\s+/g, '')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/·/g, '*').replace(/º/g, '°');
}

function normTexto(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!¡?¿]+$/, '');
}

export function esCorregible(it) {
  if (!it) return false;
  if (it.type === 'quiz') return !it.poll;
  if (it.type === 'number') return true;
  if (it.type === 'short') return String(it.accepted || '').split(';').some(x => x.trim());
  return false;
}

// true / false / null (no se corrige automáticamente)
export function comprobar(it, v) {
  if (!esCorregible(it) || v == null) return null;
  if (it.type === 'quiz') return Number(v) === Number(it.correct);
  if (it.type === 'short') {
    const validas = String(it.accepted || '').split(';').map(normTexto).filter(Boolean);
    return validas.includes(normTexto(v));
  }
  if (it.type === 'number') {
    const x = parseNum(v?.n);
    const a = Number(it.answer);
    if (Number.isNaN(x) || Number.isNaN(a)) return false;
    const tol = Math.abs(a) * (Number(it.tolerance) || 0) / 100;
    const numOk = Math.abs(x - a) <= tol + 1e-12 * Math.max(1, Math.abs(a));
    const unidadOk = it.unitMode !== 'ask' || !it.unit || normUnidad(v?.u) === normUnidad(it.unit);
    return numOk && unidadOk;
  }
  return null;
}

export function textoRespuesta(it, v) {
  if (v == null) return '';
  if (it.type === 'quiz') return it.options?.[Number(v)] ?? '';
  if (it.type === 'number') {
    const u = v.u ? ' ' + v.u : (it.unitMode !== 'ask' && it.unit ? ' ' + it.unit : '');
    return `${v.n ?? ''}${u}`;
  }
  if (it.type === 'draw') return 'Dibujo entregado';
  return String(v);
}

export const solucionTexto = it => `${it.answer}${it.unit ? ' ' + it.unit : ''}`;

export function generarCodigo() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(r, b => abc[b % abc.length]).join('');
}

export const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const fecha = ts => ts ? new Date(ts).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '';
