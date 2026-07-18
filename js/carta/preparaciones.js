import { supabase } from '/js/core/supabase.js';
import { state, showToast, fmtPesos, cargarIngredientes, cargarPreparaciones } from './utils.js';

let _prepEditando  = null;
let _subReceta     = [];   // ingredientes en la receta de esta preparación
let _ingSearchTimer = null;

const UNIDADES = ['unid.','g','kg','ml','l','cc','tbsp','tsp','pizca','porción'];

// ── Tab principal ─────────────────────────────────────────────────
export function renderTabPreparaciones() {
  const el = document.getElementById('carta-tab-content');
  if (!el) return;

  el.innerHTML = `
    <div class="carta-tab-header">
      <h2 class="carta-tab-title">Preparaciones propias</h2>
      <button class="carta-btn-primary" onclick="cartaAbrirPrepForm()">
        <i class="ti ti-plus"></i> Nueva preparación
      </button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px">
      Elaboraciones internas que tienen su propia receta y costo. Se pueden agregar a las recetas de productos.
    </p>

    <div class="carta-search-bar" style="margin-bottom:16px">
      <div class="carta-search-wrap">
        <i class="ti ti-search"></i>
        <input class="carta-search-input" type="text"
          placeholder="Buscar preparación…"
          oninput="cartaFiltrarPrepTab(this.value)" id="prep-tab-search" />
      </div>
      <span class="carta-count" id="prep-tab-count"></span>
    </div>

    <table class="carta-table" id="prep-tabla">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Unidad</th>
          <th style="text-align:right">Rendimiento</th>
          <th style="text-align:right">Costo/unidad</th>
          <th style="text-align:center">Activo</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="prep-tbody"></tbody>
    </table>

    <div class="carta-form-panel" id="prep-form-panel">
      <div id="prep-form-inner"></div>
    </div>
  `;

  _renderPrepTabla(state.preparaciones);
}

function _renderPrepTabla(lista) {
  const tbody = document.getElementById('prep-tbody');
  const count = document.getElementById('prep-tab-count');
  if (!tbody) return;
  if (count) count.textContent = `${lista.length} preparación${lista.length !== 1 ? 'es' : ''}`;
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="carta-empty-row">Sin preparaciones</td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map(p => `
    <tr class="carta-row" onclick="cartaAbrirPrepForm('${p.id}')">
      <td style="font-weight:500">${p.nombre}</td>
      <td>${p.unidad || '—'}</td>
      <td style="text-align:right">${p.rendimiento || 1}</td>
      <td style="text-align:right">${fmtPesos(p.costo_por_unidad)}</td>
      <td style="text-align:center">
        <span class="carta-badge-${p.activo ? 'ok' : 'off'}">${p.activo ? 'Sí' : 'No'}</span>
      </td>
      <td>
        <button class="carta-icon-btn" onclick="event.stopPropagation();cartaEliminarPrep('${p.id}')">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

let _prepBusqueda = '';
export function filtrarPrepTab(val) {
  _prepBusqueda = val.toLowerCase();
  const lista = state.preparaciones.filter(p =>
    p.nombre.toLowerCase().includes(_prepBusqueda)
  );
  _renderPrepTabla(lista);
}

// ── Form ──────────────────────────────────────────────────────────
export async function abrirPrepForm(id = null) {
  _prepEditando = id ? state.preparaciones.find(p => p.id === id) : null;
  _subReceta = [];
  if (_prepEditando) {
    const { data } = await supabase
      .from('preparacion_recetas')
      .select('*, ingredientes(id, nombre, unidad, costo)')
      .eq('preparacion_id', _prepEditando.id);
    _subReceta = data || [];
  }
  if (!state.ingredientes.length) await cargarIngredientes();
  _renderPrepForm(_prepEditando);
  document.getElementById('prep-form-panel').classList.add('open');
}

export function cerrarPrepForm() {
  document.getElementById('prep-form-panel').classList.remove('open');
  _prepEditando = null;
  _subReceta = [];
}

function _costoTotal() {
  return _subReceta.reduce((s, r) => {
    const cUnit = r.ingredientes?.costo || 0;
    const merma = r.merma || 0;
    const bruto = (r.cantidad_neta || 0) * (1 + merma / 100);
    return s + cUnit * bruto;
  }, 0);
}

function _costoPorUnidad() {
  const rend = parseFloat(document.getElementById('prep-rendimiento')?.value) || 1;
  return _costoTotal() / rend;
}

function _renderSubRecetaLineas() {
  if (!_subReceta.length) return `<div class="carta-mods-empty">Sin ingredientes aún</div>`;
  return _subReceta.map((r, i) => {
    const cUnit = r.ingredientes?.costo || 0;
    const merma = r.merma || 0;
    const bruto = r.cantidad_neta * (1 + merma / 100);
    const costo = cUnit * bruto;
    return `
    <div class="cf-receta-row">
      <div class="cf-receta-ing">${r.ingredientes?.nombre || '?'}</div>
      <input class="carta-input cf-receta-input" type="number" min="0" step="0.01"
        value="${r.cantidad_neta}"
        onchange="cartaActualizarSubRecetaLinea(${i}, 'cantidad_neta', this.value)" />
      <select class="carta-select cf-receta-sel"
        onchange="cartaActualizarSubRecetaLinea(${i}, 'unidad', this.value)">
        ${UNIDADES.map(u => `<option ${r.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
      </select>
      <div class="cf-receta-costo">${fmtPesos(costo)}</div>
      <button class="cf-receta-del" onclick="cartaQuitarSubRecetaLinea(${i})">
        <i class="ti ti-x"></i>
      </button>
    </div>`;
  }).join('');
}

function _renderIngPickerLista(filtro) {
  const f = filtro.toLowerCase();
  const lista = f
    ? state.ingredientes.filter(i => i.nombre.toLowerCase().includes(f) || (i.categoria||'').toLowerCase().includes(f))
    : state.ingredientes;
  const yaAgregados = new Set(_subReceta.map(r => r.ingrediente_id));
  return lista.slice(0, 80).map(i => {
    const agregado = yaAgregados.has(i.id);
    return `
    <div class="carta-mod-pick-item${agregado ? ' ing-ya-agregado' : ''}"
         onclick="cartaAgregarSubRecetaIng('${i.id}')" style="cursor:pointer">
      <span>${i.nombre}</span>
      <span style="margin-left:auto;font-size:11px;color:#888;white-space:nowrap">
        ${i.unidad || ''} · ${fmtPesos(i.costo)}/u${agregado ? ' ✓' : ''}
      </span>
    </div>`;
  }).join('') || `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Sin resultados</div>`;
}

function _renderPrepForm(p) {
  const costoU = p?.costo_por_unidad || 0;
  document.getElementById('prep-form-inner').innerHTML = `
    <div class="carta-form-header">
      <button class="carta-form-back" onclick="cartaCerrarPrepForm()">
        <i class="ti ti-arrow-left"></i>
      </button>
      <div class="carta-form-title">${p ? p.nombre : 'Nueva preparación'}</div>
      <div style="display:flex;gap:8px;margin-left:auto">
        <button class="carta-form-action-btn discard" onclick="cartaCerrarPrepForm()">
          <i class="ti ti-x"></i><span>Descartar</span>
        </button>
        <button class="carta-form-action-btn save" onclick="cartaGuardarPrep()">
          <i class="ti ti-device-floppy"></i><span>Guardar</span>
        </button>
        ${p ? `<button class="carta-form-del" onclick="cartaEliminarPrep('${p.id}')" title="Eliminar">
          <i class="ti ti-trash"></i>
        </button>` : ''}
      </div>
    </div>

    <div class="carta-form-body" style="grid-template-columns:1fr 1fr">
      <!-- Col izq: datos básicos -->
      <div class="carta-form-col">
        <div class="carta-form-section">Datos básicos</div>
        <div class="carta-field-group">
          <label class="carta-label">Nombre <span class="carta-req">*</span></label>
          <input id="prep-nombre" class="carta-input" type="text" value="${p?.nombre || ''}"
            placeholder="Ej: Crema batida, Masa de galleta…" />
        </div>
        <div class="carta-field-group" style="margin-top:10px">
          <label class="carta-label">Descripción</label>
          <textarea id="prep-desc" class="carta-input" rows="3"
            placeholder="Notas del proceso…" style="resize:vertical">${p?.descripcion || ''}</textarea>
        </div>
        <div class="carta-field-row" style="margin-top:10px">
          <div class="carta-field-group">
            <label class="carta-label">Unidad de medida</label>
            <select id="prep-unidad" class="carta-select">
              ${UNIDADES.map(u => `<option ${p?.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
          <div class="carta-field-group">
            <label class="carta-label">Rendimiento</label>
            <input id="prep-rendimiento" class="carta-input" type="number" min="0.001" step="0.01"
              value="${p?.rendimiento || 1}" oninput="cartaActualizarCostoPrep()" />
          </div>
        </div>
        <div class="carta-field-row" style="margin-top:8px">
          <label class="carta-check" style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="prep-activo" ${p?.activo !== false ? 'checked' : ''} />
            <span>Activa</span>
          </label>
        </div>

        <!-- Resumen de costos -->
        <div class="carta-form-section" style="margin-top:24px">Costo calculado</div>
        <div class="carta-cost-card" id="prep-cost-card">
          ${_renderPrepCostCard(costoU, p?.rendimiento || 1)}
        </div>
      </div>

      <!-- Col der: sub-receta -->
      <div class="carta-form-col">
        <div class="carta-form-section">Receta de la preparación</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
          Ingredientes necesarios para producir <strong>${p?.rendimiento || 1} ${p?.unidad || 'unid.'}</strong>
        </div>
        <div id="prep-subreceta-lista" class="cf-receta-lista">
          ${_renderSubRecetaLineas()}
        </div>
        <button class="carta-add-mod-btn" style="margin-top:8px" onclick="cartaAbrirPrepIngPicker()">
          <i class="ti ti-plus"></i> Agregar ingrediente
        </button>
      </div>
    </div>

    <!-- Picker de ingredientes para la sub-receta -->
    <div class="carta-ing-picker" id="prep-ing-picker" style="display:none">
      <div class="carta-mod-picker-header">
        Agregar ingrediente
        <button onclick="cartaCerrarPrepIngPicker()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted)">×</button>
      </div>
      <div style="padding:10px 16px">
        <input class="carta-input" type="text" placeholder="Buscar ingrediente…"
          oninput="cartaFiltrarPrepIng(this.value)" id="prep-ing-search" autocomplete="off" />
      </div>
      <div class="carta-mod-picker-list" id="prep-ing-picker-lista">
        ${_renderIngPickerLista('')}
      </div>
    </div>
  `;
}

function _renderPrepCostCard(costoU, rendimiento) {
  const total = _costoTotal();
  return `
    <div class="carta-cost-row">
      <span class="carta-cost-label">Costo total receta</span>
      <span class="carta-cost-val">${fmtPesos(total)}</span>
    </div>
    <div class="carta-cost-row">
      <span class="carta-cost-label">Rendimiento</span>
      <span class="carta-cost-val">${rendimiento}</span>
    </div>
    <div class="carta-cost-row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
      <span class="carta-cost-label" style="font-weight:600">Costo por unidad</span>
      <span class="carta-cost-val" style="font-weight:700;color:var(--accent)">${fmtPesos(total / (rendimiento || 1))}</span>
    </div>
  `;
}

export function actualizarCostoPrep() {
  const rend = parseFloat(document.getElementById('prep-rendimiento')?.value) || 1;
  const card = document.getElementById('prep-cost-card');
  if (card) card.innerHTML = _renderPrepCostCard(0, rend);
}

// ── Picker ingredientes sub-receta ────────────────────────────────
export function abrirPrepIngPicker() {
  const picker = document.getElementById('prep-ing-picker');
  if (picker) picker.style.display = 'flex';
  const search = document.getElementById('prep-ing-search');
  if (search) { search.value = ''; search.focus(); }
  document.getElementById('prep-ing-picker-lista').innerHTML = _renderIngPickerLista('');
}

export function cerrarPrepIngPicker() {
  const picker = document.getElementById('prep-ing-picker');
  if (picker) picker.style.display = 'none';
}

export function filtrarPrepIng(val) {
  clearTimeout(_ingSearchTimer);
  _ingSearchTimer = setTimeout(() => {
    const lista = document.getElementById('prep-ing-picker-lista');
    if (lista) lista.innerHTML = _renderIngPickerLista(val);
  }, 150);
}

export async function agregarSubRecetaIng(ingId) {
  const ing = state.ingredientes.find(i => i.id === ingId);
  if (!ing) return;
  if (_subReceta.find(r => r.ingrediente_id === ingId)) {
    showToast(`${ing.nombre} ya está en la receta`, 'error'); return;
  }
  const nuevaLinea = {
    ingrediente_id: ingId,
    cantidad_neta: 1,
    unidad: ing.unidad || 'unid.',
    merma: 0,
    ingredientes: ing,
  };
  if (_prepEditando) {
    const { data, error } = await supabase.from('preparacion_recetas').insert({
      preparacion_id: _prepEditando.id,
      ingrediente_id: ingId,
      cantidad_neta: 1,
      unidad: ing.unidad || 'unid.',
      merma: 0,
    }).select('id').single();
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    nuevaLinea.id = data.id;
  }
  _subReceta.push(nuevaLinea);
  cerrarPrepIngPicker();
  document.getElementById('prep-subreceta-lista').innerHTML = _renderSubRecetaLineas();
  _actualizarCostCardPrep();
}

export async function quitarSubRecetaLinea(idx) {
  const linea = _subReceta[idx];
  if (_prepEditando && linea?.id) {
    await supabase.from('preparacion_recetas').delete().eq('id', linea.id);
  }
  _subReceta.splice(idx, 1);
  document.getElementById('prep-subreceta-lista').innerHTML = _renderSubRecetaLineas();
  _actualizarCostCardPrep();
}

export async function actualizarSubRecetaLinea(idx, campo, valor) {
  if (!_subReceta[idx]) return;
  _subReceta[idx][campo] = campo === 'merma' || campo === 'cantidad_neta'
    ? parseFloat(valor) || 0 : valor;
  if (_prepEditando && _subReceta[idx].id) {
    const { cantidad_neta, unidad, merma } = _subReceta[idx];
    await supabase.from('preparacion_recetas').update({ cantidad_neta, unidad, merma }).eq('id', _subReceta[idx].id);
  }
  _actualizarCostCardPrep();
}

function _actualizarCostCardPrep() {
  const rend = parseFloat(document.getElementById('prep-rendimiento')?.value) || 1;
  const card = document.getElementById('prep-cost-card');
  if (card) card.innerHTML = _renderPrepCostCard(0, rend);
}

// ── Guardar / Eliminar ────────────────────────────────────────────
export async function guardarPrep() {
  const nombre = document.getElementById('prep-nombre')?.value?.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  const unidad      = document.getElementById('prep-unidad')?.value || 'unid.';
  const rendimiento = parseFloat(document.getElementById('prep-rendimiento')?.value) || 1;
  const descripcion = document.getElementById('prep-desc')?.value?.trim() || null;
  const activo      = document.getElementById('prep-activo')?.checked ?? true;
  const costoTotal  = _costoTotal();
  const costo_por_unidad = costoTotal / rendimiento;

  const payload = { nombre, unidad, rendimiento, descripcion, activo, costo_por_unidad };

  let id = _prepEditando?.id;
  let error;
  if (_prepEditando) {
    ({ error } = await supabase.from('preparaciones').update(payload).eq('id', id));
  } else {
    const { data, error: e } = await supabase.from('preparaciones').insert(payload).select('id').single();
    error = e; id = data?.id;
    // Guardar sub-receta para preparación nueva
    if (!error && id && _subReceta.length) {
      await supabase.from('preparacion_recetas').insert(
        _subReceta.map(r => ({
          preparacion_id: id,
          ingrediente_id: r.ingrediente_id,
          cantidad_neta: r.cantidad_neta,
          unidad: r.unidad,
          merma: r.merma || 0,
        }))
      );
    }
  }

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  // Actualizar costo en preparaciones ya existentes (si se editó sin guardar sub-receta)
  if (_prepEditando) {
    await supabase.from('preparaciones').update({ costo_por_unidad }).eq('id', id);
  }

  showToast(_prepEditando ? 'Preparación actualizada ✓' : 'Preparación creada ✓');
  cerrarPrepForm();
  await cargarPreparaciones();
  renderTabPreparaciones();
}

export async function eliminarPrep(id) {
  if (!confirm('¿Eliminar esta preparación? Se eliminará de todas las recetas de productos.')) return;
  const { error } = await supabase.from('preparaciones').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Preparación eliminada');
  if (document.getElementById('prep-form-panel')?.classList.contains('open')) cerrarPrepForm();
  await cargarPreparaciones();
  renderTabPreparaciones();
}
