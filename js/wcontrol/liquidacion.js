import { supabase } from '/js/core/supabase.js';
import { state, showToast, fmt2, fmtPesos, fmtDate, MESES_NOMBRES, getTrabajadorById } from './utils.js';
import { consolidarResumenMensual } from './asistencia.js';

let trabajadorActual = null;
let mesActual = 0;
let anioActual = new Date().getFullYear();
let registroId = null;
let lastCalc = null;

// ── Selector ─────────────────────────────────────────────────────
export function onTrabajadorChangeLiq() {
  const id = document.getElementById('l-trabajador').value;
  document.getElementById('l-form-wrap').style.display = 'none';
  document.getElementById('l-status').textContent = '';
  if (id) cargarHistLiq(id);
  else document.getElementById('l-hist-card').style.display = 'none';
}

async function autocompletarDesdeAsistencia(trabajadorId, anio, mes, trabajador) {
  const { data: asis } = await supabase.from('asistencia_mensual').select('dias_data')
    .eq('trabajador_id', trabajadorId).eq('anio', anio).eq('mes', mes).maybeSingle();
  if (!asis || !asis.dias_data || !asis.dias_data.length) return false;
  const r = consolidarResumenMensual(asis.dias_data, trabajador);
  document.getElementById('d-trab').value     = r.diasTrab ?? 0;
  document.getElementById('d-aus').value      = r.diasAusentes ?? 0;
  document.getElementById('hrs-desc').value   = Number((r.hrsDescTotal ?? 0).toFixed(2));
  document.getElementById('hrs-ext').value    = Number((r.hrsExt ?? 0).toFixed(2));
  document.getElementById('val-hora').value   = Math.round(r.valHora ?? 0);
  return true;
}

export async function recalcularDesdeAsistencia() {
  if (!trabajadorActual) { showToast('Primero carga un trabajador y un mes', 'error'); return; }
  const ok = await autocompletarDesdeAsistencia(trabajadorActual.id, anioActual, mesActual, trabajadorActual);
  if (!ok) { showToast('No hay Asistencia guardada para este mes', 'error'); return; }
  document.getElementById('l-status').textContent = 'Días y horas actualizados desde Asistencia (licencia/vacaciones no modificados).';
  showToast('Datos actualizados desde Asistencia ✓');
}

export async function cargarTrabajadorLiq() {
  const trabajadorId = document.getElementById('l-trabajador').value;
  if (!trabajadorId) { showToast('Selecciona un trabajador', 'error'); return; }
  const t = getTrabajadorById(trabajadorId);
  if (!t) { showToast('Trabajador no encontrado', 'error'); return; }

  trabajadorActual = t;
  mesActual  = Number(document.getElementById('l-mes').value);
  anioActual = Number(document.getElementById('l-anio').value);

  document.getElementById('lr-nombre').textContent  = t.nombre || '';
  document.getElementById('lr-cargo').textContent   = t.cargo ? `(${t.cargo})` : '';
  document.getElementById('lr-rut').textContent     = t.rut || '—';
  document.getElementById('lr-sbase').textContent   = fmtPesos(t.sueldo_base);
  document.getElementById('lr-afp').textContent     = t.afp || '—';
  document.getElementById('lr-salud').textContent   = t.institucion_salud || '—';
  document.getElementById('lr-periodo').textContent = `${MESES_NOMBRES[mesActual]} ${anioActual}`;

  const { data: liqExist } = await supabase.from('liquidaciones').select('*')
    .eq('trabajador_id', trabajadorId).eq('anio', anioActual).eq('mes', mesActual).maybeSingle();

  if (liqExist) {
    registroId = liqExist.id;
    const d = liqExist.datos || {};
    document.getElementById('d-trab').value   = d.dTrab ?? 0;
    document.getElementById('d-lic').value    = d.dLic ?? 0;
    document.getElementById('d-aus').value    = d.dAus ?? 0;
    document.getElementById('d-vac').value    = d.dVac ?? 0;
    document.getElementById('hrs-desc').value = d.hrsDesc ?? 0;
    document.getElementById('hrs-ext').value  = d.hrsExt ?? 0;
    document.getElementById('val-hora').value = d.valHora ?? 0;
    document.getElementById('l-status').textContent = `Editando liquidación guardada (${new Date(liqExist.updated_at).toLocaleString('es-CL')}). Usa "Recalcular desde Asistencia" para traer valores actualizados.`;
  } else {
    registroId = null;
    const ok = await autocompletarDesdeAsistencia(trabajadorId, anioActual, mesActual, t);
    if (ok) {
      document.getElementById('l-status').textContent = 'Días y horas recalculados desde Asistencia.';
    } else {
      ['d-trab','d-aus','hrs-desc','hrs-ext','val-hora'].forEach(id => { const el = document.getElementById(id); if(el) el.value = 0; });
      document.getElementById('l-status').textContent = 'Sin Asistencia guardada para este mes — ingresa los valores manualmente.';
    }
    document.getElementById('d-lic').value = 0;
    document.getElementById('d-vac').value = 0;
  }

  document.getElementById('l-form-wrap').style.display = 'block';
  document.getElementById('resultado-box').classList.remove('visible');
  document.getElementById('btn-validar').classList.remove('visible');
  document.getElementById('vista-impresion').classList.remove('visible');
  document.getElementById('liq-panel-datos').style.display = 'block';
  lastCalc = null;
  cargarHistLiq(trabajadorId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Cálculo ──────────────────────────────────────────────────────
export function calcularLiq() {
  const t = trabajadorActual;
  if (!t) { showToast('Carga un trabajador primero', 'error'); return; }

  const sbase    = t.sueldo_base || 0;
  const dTrab    = Number(document.getElementById('d-trab').value) || 0;
  const hrsDesc  = Number(document.getElementById('hrs-desc').value) || 0;
  const hrsExt   = Number(document.getElementById('hrs-ext').value) || 0;
  const valHora  = Number(document.getElementById('val-hora').value) || 0;
  const tasaAfp  = t.tasa_afp || 0;
  const afpAdic  = t.afp_adicional || 0;
  const planSalud = t.plan_salud || 0;

  const montoHrsDesc   = Math.round(hrsDesc * valHora);
  const montoHrsExt    = Math.round(hrsExt * valHora * 1.5);
  const sueldoProp     = Math.max(0, Math.round((sbase / 30) * dTrab) - montoHrsDesc);
  const gratifMensual  = Math.round((sueldoProp + montoHrsExt) / 4);
  const totalImponible = sueldoProp + montoHrsExt + gratifMensual;
  const totalAfp       = Math.round(totalImponible * (tasaAfp + afpAdic) / 100);
  const aporteSalud    = Math.round(totalImponible * planSalud / 100);
  const leyesSociales  = totalAfp + aporteSalud;
  const sueldoLiquido  = totalImponible - leyesSociales;

  lastCalc = { sbase, dTrab, hrsDesc, hrsExt, valHora, tasaAfp, afpAdic, planSalud,
    montoHrsDesc, montoHrsExt, sueldoProp, gratifMensual, totalImponible,
    totalAfp, aporteSalud, leyesSociales, baseTributable: sueldoLiquido, sueldoLiquido };

  document.getElementById('r-hrs-lbl').textContent = `Descuento ${fmt2(hrsDesc)} hrs`;
  document.getElementById('r-hrs').textContent     = '-' + fmtPesos(montoHrsDesc);
  document.getElementById('r-hrs').className       = 'wc-res-val negativo';
  document.getElementById('r-prop').textContent    = fmtPesos(sueldoProp);
  document.getElementById('r-ext-lbl').textContent = `Horas extra (${fmt2(hrsExt)} hrs x1,5)`;
  document.getElementById('r-ext').textContent     = fmtPesos(montoHrsExt);
  document.getElementById('r-grat').textContent    = fmtPesos(gratifMensual);
  document.getElementById('r-imp').textContent     = fmtPesos(totalImponible);
  document.getElementById('r-afp-lbl').textContent = (t.afp || 'AFP') + ` (${fmt2(tasaAfp + afpAdic)}%)`;
  document.getElementById('r-afp').textContent     = '-' + fmtPesos(totalAfp);
  document.getElementById('r-sal-lbl').textContent = (t.institucion_salud || 'Salud') + ` (${fmt2(planSalud)}%)`;
  document.getElementById('r-sal').textContent     = '-' + fmtPesos(aporteSalud);
  document.getElementById('r-desc').textContent    = '-' + fmtPesos(leyesSociales);
  document.getElementById('r-liq').textContent     = fmtPesos(sueldoLiquido);

  document.getElementById('resultado-box').classList.add('visible');
  document.getElementById('btn-validar').classList.add('visible');
}

// ── Vista impresión ──────────────────────────────────────────────
export async function mostrarImpresionLiq() {
  if (!lastCalc) { showToast('Primero calcula la liquidación', 'error'); return; }
  const t = trabajadorActual;
  const c = lastCalc;
  const emp = state.empresaCache || {};
  const logoHtml = emp.logo_url
    ? `<img src="${emp.logo_url}" alt="Logo" style="width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;display:block;">`
    : '<span style="color:var(--hint);font-size:11px">LOGO</span>';

  document.getElementById('liq-content').innerHTML = `
    <div class="liq-header">
      <div class="liq-logo">${logoHtml}</div>
      <div>
        <div class="liq-empresa-nombre">${emp.nombre || ''}</div>
        <div style="font-size:12px;color:var(--muted)">RUT ${emp.rut || ''} — ${emp.direccion || ''}</div>
      </div>
    </div>
    <div class="liq-titulo">LIQUIDACIÓN DE SUELDO — ${MESES_NOMBRES[mesActual].toUpperCase()} ${anioActual}</div>
    <div class="liq-info-grid">
      <div class="liq-lbl">Trabajador</div><div class="liq-val">${t.nombre||''}</div>
      <div class="liq-lbl">RUT</div><div class="liq-val">${t.rut||''}</div>
      <div class="liq-lbl">Cargo</div><div class="liq-val">${t.cargo||''}</div>
      <div class="liq-lbl">Centro de negocio</div><div class="liq-val">${t.centro_negocio||''}</div>
      <div class="liq-lbl">Tipo de contrato</div><div class="liq-val">${t.indefinido?'Indefinido':(t.tipo_contrato||'')}</div>
      <div class="liq-lbl">Inicio contrato</div><div class="liq-val">${fmtDate(t.fecha_inicio)}</div>
      <div class="liq-lbl">AFP</div><div class="liq-val">${t.afp||''}</div>
      <div class="liq-lbl">Salud</div><div class="liq-val">${t.institucion_salud||''}</div>
    </div>
    <div class="haberes-desc">
      <div>
        <div class="hd-title">Haberes</div>
        <div class="hd-row"><span class="hd-lbl">Sueldo base proporcional (${c.dTrab} días)</span><span class="hd-val">${fmtPesos(c.sueldoProp)}</span></div>
        <div class="hd-row"><span class="hd-lbl">Horas extra (${fmt2(c.hrsExt)} hrs x1,5)</span><span class="hd-val">${fmtPesos(c.montoHrsExt)}</span></div>
        <div class="hd-row"><span class="hd-lbl">Gratificación mensual</span><span class="hd-val">${fmtPesos(c.gratifMensual)}</span></div>
        <div class="hd-row" style="font-weight:600"><span class="hd-lbl">Total imponible</span><span class="hd-val">${fmtPesos(c.totalImponible)}</span></div>
      </div>
      <div>
        <div class="hd-title">Descuentos</div>
        <div class="hd-row"><span class="hd-lbl">Horas descontadas (${fmt2(c.hrsDesc)} hrs)</span><span class="hd-val">${fmtPesos(c.montoHrsDesc)}</span></div>
        <div class="hd-row"><span class="hd-lbl">${t.afp||'AFP'} (${fmt2(c.tasaAfp+c.afpAdic)}%)</span><span class="hd-val">${fmtPesos(c.totalAfp)}</span></div>
        <div class="hd-row"><span class="hd-lbl">${t.institucion_salud||'Salud'} (${fmt2(c.planSalud)}%)</span><span class="hd-val">${fmtPesos(c.aporteSalud)}</span></div>
        <div class="hd-row" style="font-weight:600"><span class="hd-lbl">Total leyes sociales</span><span class="hd-val">${fmtPesos(c.leyesSociales)}</span></div>
      </div>
    </div>
    <div class="totales-box">
      <div class="tot-row"><span class="tot-lbl">Total imponible</span><span>${fmtPesos(c.totalImponible)}</span></div>
      <div class="tot-row"><span class="tot-lbl">Total descuentos</span><span>-${fmtPesos(c.leyesSociales)}</span></div>
      <div class="tot-row"><span class="tot-lbl">Días trabajados</span><span>${c.dTrab}</span></div>
      <div class="tot-row"><span class="tot-lbl">Días de ausencia</span><span>${document.getElementById('d-aus').value||0}</span></div>
    </div>
    <div class="liquido-box">
      <div class="liquido-lbl">Sueldo líquido a pagar</div>
      <div class="liquido-val">${fmtPesos(c.sueldoLiquido)}</div>
    </div>
    <p style="font-size:11px;color:var(--muted);margin-top:16px">Certifico haber recibido conforme la presente liquidación de sueldo correspondiente al período señalado.</p>
    <div style="width:200px;border-top:1px solid var(--text);margin-top:32px;padding-top:4px;font-size:11px;color:var(--muted)">Firma trabajador</div>
  `;

  await guardarLiquidacionDB();

  document.getElementById('liq-panel-datos').style.display = 'none';
  document.getElementById('vista-impresion').classList.add('visible');
}

async function guardarLiquidacionDB() {
  if (!lastCalc || !trabajadorActual) return;
  const c = lastCalc;
  const datos = {
    dTrab: c.dTrab, dLic: Number(document.getElementById('d-lic').value)||0,
    dAus: Number(document.getElementById('d-aus').value)||0,
    dVac: Number(document.getElementById('d-vac').value)||0,
    hrsDesc: c.hrsDesc, hrsExt: c.hrsExt, valHora: c.valHora,
    montoHrsDesc: c.montoHrsDesc, montoHrsExt: c.montoHrsExt, sueldoProp: c.sueldoProp,
    gratifMensual: c.gratifMensual, totalImponible: c.totalImponible, totalAfp: c.totalAfp,
    aporteSalud: c.aporteSalud, leyesSociales: c.leyesSociales,
    baseTributable: c.baseTributable, sueldoLiquido: c.sueldoLiquido,
  };
  const { data, error } = await supabase.from('liquidaciones')
    .upsert({ trabajador_id: trabajadorActual.id, anio: anioActual, mes: mesActual, datos, updated_at: new Date().toISOString() },
             { onConflict: 'trabajador_id,anio,mes' })
    .select().single();
  if (error) { showToast('Liquidación calculada, pero no se pudo guardar: ' + error.message, 'error'); return; }
  registroId = data.id;
  showToast('Liquidación guardada ✓');
}

export function volverDatosLiq() {
  document.getElementById('vista-impresion').classList.remove('visible');
  document.getElementById('liq-panel-datos').style.display = 'block';
}

async function cargarHistLiq(trabajadorId) {
  const { data, error } = await supabase.from('liquidaciones').select('anio,mes,updated_at,datos')
    .eq('trabajador_id', trabajadorId).order('anio', { ascending: false }).order('mes', { ascending: false });
  const card = document.getElementById('l-hist-card');
  const list = document.getElementById('l-hist-list');
  if (!card || !list) return;
  if (error || !data || !data.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  list.innerHTML = data.map(r => `
    <div class="wc-hist-item">
      <div style="flex:1;display:flex;justify-content:space-between;align-items:center;cursor:pointer"
           onclick="document.getElementById('l-mes').value='${r.mes}';document.getElementById('l-anio').value='${r.anio}';wcCargarTrabajadorLiq()">
        <span>${MESES_NOMBRES[r.mes]} ${r.anio}</span>
        <span style="font-size:11px;color:var(--hint)">${r.datos?.sueldoLiquido?fmtPesos(r.datos.sueldoLiquido)+' · ':''}${new Date(r.updated_at).toLocaleDateString('es-CL')}</span>
      </div>
      <button class="btn btn-sm btn-danger" style="margin-left:8px" title="Eliminar" onclick="event.stopPropagation();wcEliminarLiquidacion('${trabajadorId}',${r.mes},${r.anio})">🗑️</button>
    </div>`).join('');
}

export async function eliminarLiquidacion(trabajadorId, mes, anio) {
  if (!confirm(`¿Eliminar la liquidación de ${MESES_NOMBRES[mes]} ${anio}? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabase.from('liquidaciones').delete()
    .eq('trabajador_id', trabajadorId).eq('anio', anio).eq('mes', mes);
  if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return; }
  showToast('Liquidación eliminada ✓');
  cargarHistLiq(trabajadorId);
  if (trabajadorActual && trabajadorActual.id === trabajadorId && mesActual === mes && anioActual === anio) {
    document.getElementById('l-mes').value  = String(mes);
    document.getElementById('l-anio').value = String(anio);
    await cargarTrabajadorLiq();
  }
}

// ── Empresa + Logo ───────────────────────────────────────────────
export async function cargarEmpresa() {
  const { data, error } = await supabase.from('empresa').select('*').eq('id', 1).single();
  if (error) { showToast('No se pudo cargar la empresa: ' + error.message, 'error'); return; }
  state.empresaCache = data;
  document.getElementById('emp-rut').value      = data.rut      || '';
  document.getElementById('emp-nombre').value   = data.nombre   || '';
  document.getElementById('emp-direccion').value = data.direccion || '';
  renderLogoPreview();
}

export async function guardarEmpresa() {
  const payload = {
    id: 1,
    rut:       document.getElementById('emp-rut').value.trim(),
    nombre:    document.getElementById('emp-nombre').value.trim(),
    direccion: document.getElementById('emp-direccion').value.trim(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('empresa').upsert(payload);
  if (error) { showToast('Error al guardar empresa: ' + error.message, 'error'); return; }
  state.empresaCache = { ...state.empresaCache, ...payload };
  showToast('Datos de empresa guardados ✓');
}

export function renderLogoPreview() {
  const box = document.getElementById('emp-logo-preview');
  if (!box) return;
  if (state.empresaCache && state.empresaCache.logo_url) {
    box.innerHTML = `<img src="${state.empresaCache.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:contain;display:block;" />`;
  } else {
    box.innerHTML = '<span style="color:var(--hint);font-size:13px">Sin logo</span>';
  }
}

let logoFileSeleccionado = null;
export function onLogoFileSelected() {
  const input = document.getElementById('emp-logo-file');
  logoFileSeleccionado = input.files[0] || null;
  if (logoFileSeleccionado) {
    const box = document.getElementById('emp-logo-preview');
    if (box) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(logoFileSeleccionado);
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
      box.innerHTML = ''; box.appendChild(img);
    }
  }
}

export async function subirLogoEmpresa() {
  if (!logoFileSeleccionado) { showToast('Primero elige una imagen', 'error'); return; }
  const ext  = (logoFileSeleccionado.name.split('.').pop() || 'png').toLowerCase();
  const path = `logo-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('logos').upload(path, logoFileSeleccionado, { upsert: true });
  if (upErr) { showToast('Error al subir el logo: ' + upErr.message, 'error'); return; }
  const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path);
  const oldPath = state.empresaCache ? state.empresaCache.logo_path : null;
  const { error: dbErr } = await supabase.from('empresa').update({
    logo_path: path, logo_url: urlData.publicUrl, updated_at: new Date().toISOString(),
  }).eq('id', 1);
  if (dbErr) { showToast('El logo se subió pero no se pudo guardar la referencia: ' + dbErr.message, 'error'); return; }
  if (oldPath && oldPath !== path) await supabase.storage.from('logos').remove([oldPath]);
  if (!state.empresaCache) state.empresaCache = {};
  state.empresaCache.logo_path = path;
  state.empresaCache.logo_url  = urlData.publicUrl;
  logoFileSeleccionado = null;
  document.getElementById('emp-logo-file').value = '';
  renderLogoPreview();
  showToast('Logo actualizado ✓');
}

export async function quitarLogoEmpresa() {
  if (!state.empresaCache?.logo_path) { showToast('No hay logo cargado', 'error'); return; }
  if (!confirm('¿Quitar el logo de la empresa?')) return;
  await supabase.storage.from('logos').remove([state.empresaCache.logo_path]);
  const { error } = await supabase.from('empresa').update({ logo_path: null, logo_url: null, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) { showToast('Error al quitar el logo: ' + error.message, 'error'); return; }
  state.empresaCache.logo_path = null;
  state.empresaCache.logo_url  = null;
  renderLogoPreview();
  showToast('Logo eliminado');
}
