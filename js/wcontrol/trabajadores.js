import { supabase } from '/js/core/supabase.js';
import { state, showToast, fmtPesos, fmtDate, getDiasLaboralesSet, horasEntreTiempos, fmt2,
         DIAS_NOMBRE, getTrabajadorById } from './utils.js';

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

let editingId = null;
let horarioSemanaActual = {};

// ── Carga cache ──────────────────────────────────────────────────
export async function cargarTrabajadoresCache() {
  const { data, error } = await supabase.from('trabajadores').select('*').order('nombre');
  if (error) { showToast('No se pudieron cargar los trabajadores: ' + error.message, 'error'); return; }
  state.trabajadoresCache = data || [];
}

export function poblarSelectsTrabajador() {
  const activos = state.trabajadoresCache.filter(t => t.activo);
  ['a-trabajador', 'l-trabajador'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Selecciona —</option>' +
      activos.map(t => `<option value="${t.id}">${t.nombre}${t.cargo ? ' (' + t.cargo + ')' : ''}</option>`).join('');
    if (prev && activos.some(t => t.id === prev)) sel.value = prev;
  });
}

// ── Lista ────────────────────────────────────────────────────────
export function renderTrabajadoresList() {
  const cont = document.getElementById('trab-list');
  if (!cont) return;
  if (!state.trabajadoresCache.length) {
    cont.innerHTML = '<div class="wc-empty">Aún no hay trabajadores. Usa "+ Nuevo trabajador" para empezar.</div>';
    return;
  }
  const ordenados = [...state.trabajadoresCache].sort((a, b) => (b.activo - a.activo) || a.nombre.localeCompare(b.nombre));
  cont.innerHTML = ordenados.map(t => {
    const inicial = (t.nombre || '?').trim().charAt(0).toUpperCase();
    return `<div class="trab-card ${t.activo ? '' : 'trab-inactivo'}">
      <div class="trab-avatar">${inicial}</div>
      <div class="trab-info">
        <div class="trab-nombre">${t.nombre}${!t.activo ? '<span class="trab-tag">Archivado</span>' : ''}</div>
        <div class="trab-meta">${t.cargo || 'Sin cargo'} · ${t.rut || 'Sin RUT'} · ${fmtPesos(t.sueldo_base)}</div>
      </div>
      <div class="trab-actions">
        ${t.contrato_path ? `<button class="btn btn-sm" onclick="wcVerContrato('${t.contrato_path}')">📄 Contrato</button>` : ''}
        <button class="btn btn-sm" onclick="wcAbrirFormTrabajador('${t.id}')">Editar</button>
        <button class="btn btn-sm" onclick="wcArchivarTrabajador('${t.id}',${!t.activo})">${t.activo ? 'Archivar' : 'Reactivar'}</button>
        <button class="btn btn-sm btn-danger" onclick="wcEliminarTrabajador('${t.id}')">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

// ── Abrir / cerrar form ──────────────────────────────────────────
export function abrirFormTrabajador(id) {
  document.getElementById('trab-list-card').style.display = 'none';
  document.getElementById('trab-form-wrap').style.display = 'block';
  if (id) {
    const t = getTrabajadorById(id);
    if (!t) { showToast('Trabajador no encontrado', 'error'); return; }
    editingId = id;
    document.getElementById('trab-form-title').textContent = 'Editar trabajador';
    ['t-nombre','t-rut','t-cargo','t-centro-negocio','t-fecha-inicio','t-fecha-fin',
     't-domicilio','t-telefono','t-correo','t-banco','t-tipo-cuenta','t-numero-cuenta'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.value = t[fid.replace('t-','').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] || '';
    });
    document.getElementById('t-nombre').value = t.nombre || '';
    document.getElementById('t-rut').value = t.rut || '';
    document.getElementById('t-cargo').value = t.cargo || '';
    document.getElementById('t-centro-negocio').value = t.centro_negocio || '';
    document.getElementById('t-tipo-contrato').value = t.tipo_contrato || 'PLAZO FIJO';
    document.getElementById('t-fecha-inicio').value = t.fecha_inicio || '';
    document.getElementById('t-fecha-fin').value = t.fecha_fin || '';
    document.getElementById('t-indefinido').checked = !!t.indefinido;
    document.getElementById('t-domicilio').value = t.domicilio || '';
    document.getElementById('t-telefono').value = t.telefono || '';
    document.getElementById('t-correo').value = t.correo || '';
    document.getElementById('t-banco').value = t.banco || '';
    document.getElementById('t-tipo-cuenta').value = t.tipo_cuenta || '';
    document.getElementById('t-numero-cuenta').value = t.numero_cuenta || '';
    document.getElementById('t-sueldo-base').value = t.sueldo_base || 0;
    document.getElementById('t-afp').value = t.afp || '';
    document.getElementById('t-tasa-afp').value = t.tasa_afp ?? 10.46;
    document.getElementById('t-afp-adicional').value = t.afp_adicional ?? 0;
    document.getElementById('t-inst-salud').value = t.institucion_salud || 'FONASA';
    document.getElementById('t-plan-salud').value = t.plan_salud ?? 7;
    document.getElementById('t-dias-laborales').value = t.dias_laborales || 'lunes-viernes';
    document.getElementById('t-hrs-semana').value = t.hrs_semana || 44;
    horarioSemanaActual = t.horario_semana && typeof t.horario_semana === 'object' ? { ...t.horario_semana } : {};
    renderContratoActual(t);
  } else {
    editingId = null;
    document.getElementById('trab-form-title').textContent = 'Nuevo trabajador';
    ['t-nombre','t-rut','t-cargo','t-centro-negocio','t-fecha-inicio','t-fecha-fin',
     't-domicilio','t-telefono','t-correo','t-banco','t-tipo-cuenta','t-numero-cuenta'].forEach(fid => {
      const el = document.getElementById(fid); if (el) el.value = '';
    });
    document.getElementById('t-indefinido').checked = false;
    document.getElementById('t-tipo-contrato').value = 'PLAZO FIJO';
    document.getElementById('t-sueldo-base').value = 0;
    document.getElementById('t-afp').value = '';
    document.getElementById('t-tasa-afp').value = 10.46;
    document.getElementById('t-afp-adicional').value = 0;
    document.getElementById('t-inst-salud').value = 'FONASA';
    document.getElementById('t-plan-salud').value = 7;
    document.getElementById('t-dias-laborales').value = 'lunes-viernes';
    document.getElementById('t-hrs-semana').value = 44;
    horarioSemanaActual = {};
    renderContratoActual(null);
  }
  document.getElementById('t-contrato-file').value = '';
  onIndefinidoChange();
  renderHorarioSemanaForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function cerrarFormTrabajador() {
  document.getElementById('trab-form-wrap').style.display = 'none';
  document.getElementById('trab-list-card').style.display = 'block';
  editingId = null;
}

export function onIndefinidoChange() {
  const checked = document.getElementById('t-indefinido').checked;
  const fechaFin = document.getElementById('t-fecha-fin');
  if (checked) { fechaFin.value = ''; fechaFin.disabled = true; }
  else { fechaFin.disabled = false; }
}

// ── Horario semanal ──────────────────────────────────────────────
export function renderHorarioSemanaForm() {
  const diasConfig = document.getElementById('t-dias-laborales').value;
  const working = new Set(getDiasLaboralesSet(diasConfig));
  const tbody = document.getElementById('t-horario-body');
  if (!tbody) return;

  tbody.innerHTML = ORDEN_DIAS.map(diaIdx => {
    if (!working.has(diaIdx)) {
      return `<tr><td class="wc-dia-nombre">${DIAS_NOMBRE[diaIdx]}</td><td colspan="3"><span style="color:var(--hint);font-size:12px">Día libre</span></td><td>—</td></tr>`;
    }
    const d = horarioSemanaActual[diaIdx] || {};
    const entrada = d.entrada || '09:00';
    const salida  = d.salida  || '18:00';
    const colacion = d.colacion ?? 60;
    return `<tr id="trh-${diaIdx}">
      <td class="wc-dia-nombre">${DIAS_NOMBRE[diaIdx]}</td>
      <td><input type="time" class="wc-time-input" value="${entrada}" oninput="wcHorarioChange(${diaIdx},'entrada',this.value)" /></td>
      <td><input type="time" class="wc-time-input" value="${salida}"  oninput="wcHorarioChange(${diaIdx},'salida',this.value)" /></td>
      <td><input type="number" min="0" step="5" value="${colacion}" oninput="wcHorarioChange(${diaIdx},'colacion',this.value)" style="width:72px;padding:4px 6px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px" /> min</td>
      <td><span id="trh-hrs-${diaIdx}" class="wc-hrs-badge" style="background:var(--green-light);color:var(--green)">0,00</span></td>
    </tr>`;
  }).join('');

  working.forEach(diaIdx => {
    if (!horarioSemanaActual[diaIdx]) horarioSemanaActual[diaIdx] = { entrada: '09:00', salida: '18:00', colacion: 60 };
  });
  recalcularHorasHorario();
}

export function onHorarioChange(diaIdx, campo, value) {
  if (!horarioSemanaActual[diaIdx]) horarioSemanaActual[diaIdx] = {};
  horarioSemanaActual[diaIdx][campo] = campo === 'colacion' ? Number(value) : value;
  recalcularHorasHorario();
}

function recalcularHorasHorario() {
  const diasConfig = document.getElementById('t-dias-laborales').value;
  const working = getDiasLaboralesSet(diasConfig);
  let total = 0;
  working.forEach(diaIdx => {
    const d = horarioSemanaActual[diaIdx] || {};
    const horas = Math.max(0, horasEntreTiempos(d.entrada, d.salida) - (d.colacion || 0) / 60);
    total += horas;
    const span = document.getElementById('trh-hrs-' + diaIdx);
    if (span) span.textContent = fmt2(horas);
  });
  const totalEl = document.getElementById('t-total-hrs');
  if (totalEl) totalEl.textContent = fmt2(total) + ' hrs';
}

// ── Contrato PDF ─────────────────────────────────────────────────
function renderContratoActual(t) {
  const box = document.getElementById('t-contrato-actual');
  if (!box) return;
  if (t && t.contrato_path) {
    box.innerHTML = `<div style="display:flex;align-items:center;gap:8px;font-size:13px">
      <span>📄 ${t.contrato_nombre || 'contrato.pdf'}</span>
      <button type="button" class="btn btn-sm" onclick="wcVerContrato('${t.contrato_path}')">Ver</button>
      <button type="button" class="btn btn-sm btn-danger" onclick="wcQuitarContrato('${t.id}')">Quitar</button>
    </div>`;
  } else {
    box.innerHTML = '<span style="color:var(--hint);font-size:13px">Sin contrato cargado.</span>';
  }
}

export async function verContrato(path) {
  const { data, error } = await supabase.storage.from('contratos').createSignedUrl(path, 300);
  if (error) { showToast('No se pudo abrir el contrato: ' + error.message, 'error'); return; }
  window.open(data.signedUrl, '_blank');
}

export async function quitarContrato(id) {
  const t = getTrabajadorById(id);
  if (!t || !t.contrato_path) return;
  if (!confirm('¿Quitar el contrato cargado para este trabajador?')) return;
  await supabase.storage.from('contratos').remove([t.contrato_path]);
  const { error } = await supabase.from('trabajadores')
    .update({ contrato_path: null, contrato_nombre: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { showToast('Error al quitar contrato: ' + error.message, 'error'); return; }
  await cargarTrabajadoresCache();
  renderContratoActual(getTrabajadorById(id));
  renderTrabajadoresList();
  showToast('Contrato eliminado');
}

// ── Guardar ──────────────────────────────────────────────────────
export async function guardarTrabajador() {
  const nombre = document.getElementById('t-nombre').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  const indefinido = document.getElementById('t-indefinido').checked;
  const payload = {
    nombre,
    rut: document.getElementById('t-rut').value.trim(),
    cargo: document.getElementById('t-cargo').value.trim(),
    centro_negocio: document.getElementById('t-centro-negocio').value.trim(),
    tipo_contrato: document.getElementById('t-tipo-contrato').value,
    fecha_inicio: document.getElementById('t-fecha-inicio').value || null,
    fecha_fin: indefinido ? null : (document.getElementById('t-fecha-fin').value || null),
    indefinido,
    domicilio: document.getElementById('t-domicilio').value.trim(),
    telefono: document.getElementById('t-telefono').value.trim(),
    correo: document.getElementById('t-correo').value.trim(),
    banco: document.getElementById('t-banco').value.trim(),
    tipo_cuenta: document.getElementById('t-tipo-cuenta').value.trim(),
    numero_cuenta: document.getElementById('t-numero-cuenta').value.trim(),
    sueldo_base: Number(document.getElementById('t-sueldo-base').value) || 0,
    afp: document.getElementById('t-afp').value.trim(),
    tasa_afp: Number(document.getElementById('t-tasa-afp').value) || 0,
    afp_adicional: Number(document.getElementById('t-afp-adicional').value) || 0,
    institucion_salud: document.getElementById('t-inst-salud').value.trim(),
    plan_salud: Number(document.getElementById('t-plan-salud').value) || 0,
    dias_laborales: document.getElementById('t-dias-laborales').value,
    hrs_semana: Number(document.getElementById('t-hrs-semana').value) || 0,
    horario_semana: horarioSemanaActual,
    updated_at: new Date().toISOString(),
  };

  let trabId = editingId;
  let error;
  if (trabId) {
    ({ error } = await supabase.from('trabajadores').update(payload).eq('id', trabId));
  } else {
    payload.activo = true;
    const { data, error: insErr } = await supabase.from('trabajadores').insert(payload).select().single();
    error = insErr;
    if (!error) trabId = data.id;
  }
  if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }

  const fileInput = document.getElementById('t-contrato-file');
  const contratoFile = fileInput.files[0];
  if (contratoFile) {
    const ext = (contratoFile.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${trabId}/contrato_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('contratos').upload(path, contratoFile, { upsert: true });
    if (upErr) {
      showToast('Trabajador guardado, pero el contrato no se pudo subir: ' + upErr.message, 'error');
    } else {
      const tPrevio = getTrabajadorById(trabId);
      if (tPrevio && tPrevio.contrato_path && tPrevio.contrato_path !== path) {
        await supabase.storage.from('contratos').remove([tPrevio.contrato_path]);
      }
      await supabase.from('trabajadores').update({ contrato_path: path, contrato_nombre: contratoFile.name }).eq('id', trabId);
    }
    fileInput.value = '';
  }

  await cargarTrabajadoresCache();
  renderTrabajadoresList();
  poblarSelectsTrabajador();
  cerrarFormTrabajador();
  showToast('Trabajador guardado ✓');
}

export async function archivarTrabajador(id, nuevoEstado) {
  const { error } = await supabase.from('trabajadores').update({ activo: nuevoEstado, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  await cargarTrabajadoresCache();
  renderTrabajadoresList();
  poblarSelectsTrabajador();
  showToast(nuevoEstado ? 'Trabajador reactivado ✓' : 'Trabajador archivado ✓');
}

export async function eliminarTrabajador(id) {
  const t = getTrabajadorById(id);
  const ok = confirm(`¿Eliminar a "${t ? t.nombre : ''}"?\n\nEsto también borrará TODA su asistencia y liquidaciones guardadas (y su contrato, si tiene uno cargado). Esta acción no se puede deshacer.\n\nSi solo quieres ocultarlo, usa "Archivar".`);
  if (!ok) return;
  if (t && t.contrato_path) await supabase.storage.from('contratos').remove([t.contrato_path]);
  const { error } = await supabase.from('trabajadores').delete().eq('id', id);
  if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return; }
  await cargarTrabajadoresCache();
  renderTrabajadoresList();
  poblarSelectsTrabajador();
  showToast('Trabajador eliminado');
}
