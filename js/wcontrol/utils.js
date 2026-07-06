// Shared state, utilities and toast for Wcontrol module
export const state = {
  trabajadoresCache: [],
  empresaCache: null,
};

export function fmt2(n) {
  return (n || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtPesos(n) { return '$' + Math.round(n || 0).toLocaleString('es-CL'); }
export function fmtDate(d) {
  if (!d) return '';
  const p = d.split('-');
  return p.length !== 3 ? d : p[2] + '/' + p[1] + '/' + p[0];
}
export function horasEntreTiempos(t1, t2) {
  if (!t1 || !t2) return 0;
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  return Math.max(0, ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60);
}
export function getDiasLaboralesSet(config) {
  if (config === 'martes-sabado') return [2,3,4,5,6];
  if (config === 'lunes-viernes') return [1,2,3,4,5];
  if (config === 'lunes-sabado')  return [1,2,3,4,5,6];
  return [1,2,3,4,5];
}

export const DIAS_CORTO    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
export const DIAS_NOMBRE   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
export const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export function getTrabajadorById(id) {
  return state.trabajadoresCache.find(t => String(t.id) === String(id)) || null;
}

let toastTimer = null;
export function showToast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast visible' + (type === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), type === 'error' ? 6000 : 3000);
}

export function redondear(n) {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

export function getLunesDeSemana(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  const diasDesdeLunes = (fecha.getDay() + 6) % 7;
  const lunes = new Date(fecha);
  lunes.setDate(fecha.getDate() - diasDesdeLunes);
  return lunes;
}

export function fechaKeyLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDateCorta(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}
