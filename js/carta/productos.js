import { supabase } from '/js/core/supabase.js';
import {
  state, showToast, fmtPesos, calcMargen, calcMarkup,
  cargarProductos, cargarIngredientes, cargarPreparaciones, cargarReceta,
} from './utils.js';

let _busqueda = '';
let _productoEditando = null;
let _receta = [];          // líneas de receta en edición
let _ingSearchTimer = null;

// ── Render lista ─────────────────────────────────────────────────
export function renderListaProductos() {
  const tbody = document.getElementById('carta-tbody');
  if (!tbody) return;

  const filtrados = state.productos.filter(p => {
    if (!state.mostrarInactivos && !p.activo) return false;
    if (!_busqueda) return true;
    return p.nombre.toLowerCase().includes(_busqueda.toLowerCase()) ||
           (p.codigo || '').toLowerCase().includes(_busqueda.toLowerCase());
  });

  const n = filtrados.length;
  document.getElementById('carta-count').textContent = `${n} producto${n !== 1 ? 's' : ''}`;

  if (!n) {
    tbody.innerHTML = `<tr><td colspan="7" class="carta-empty-row">Sin productos</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(p => {
    const margen = calcMargen(p.precio, p.costo);
    const activo = p.activo ? '' : 'carta-row-inactivo';
    return `
    <tr class="carta-row ${activo}" onclick="cartaAbrirProducto('${p.id}')">
      <td class="carta-td-cod">${p.codigo || '—'}</td>
      <td class="carta-td-nombre">
        ${p.nombre}
        ${!p.activo ? '<span class="carta-badge-inactivo">Inactivo</span>' : ''}
      </td>
      <td class="carta-td-num">${p.costo ? fmtPesos(p.costo) : '—'}</td>
      <td class="carta-td-num">${p.precio && p.costo ? fmtPesos(p.precio - p.costo) : '—'}</td>
      <td class="carta-td-num">${p.precio && p.costo ? margen.toFixed(1) + '%' : '—'}</td>
      <td class="carta-td-num">${p.precio ? fmtPesos(p.precio) : '—'}</td>
      <td class="carta-td-cat">${p.categorias_productos?.nombre || '—'}</td>
    </tr>`;
  }).join('');
}

export function onBusqueda(val) {
  _busqueda = val;
  renderListaProductos();
}

export function toggleInactivos(checked) {
  state.mostrarInactivos = checked;
  renderListaProductos();
}

// ── Abrir form producto ──────────────────────────────────────────
export async function abrirProducto(id) {
  _productoEditando = id === 'nuevo' ? null : state.productos.find(p => p.id === id);
  _receta = [];
  if (_productoEditando) {
    _receta = await cargarReceta(_productoEditando.id);
  }
  if (!state.ingredientes.length)   await cargarIngredientes();
  if (!state.preparaciones.length)  await cargarPreparaciones();
  _renderForm(_productoEditando);
  document.getElementById('carta-form-panel').classList.add('open');
}

export function cerrarForm() {
  document.getElementById('carta-form-panel').classList.remove('open');
  _productoEditando = null;
  _receta = [];
}

function _renderForm(p) {
  const panel = document.getElementById('carta-form-panel');
  const es_nuevo = !p;

  const cats = state.categorias.map(c =>
    `<option value="${c.id}" ${p?.categoria_id === c.id ? 'selected' : ''}>${c.nombre}</option>`
  ).join('');

  const costoReceta = _receta.reduce((s, r) => {
    const cUnit = r.ingredientes?.costo || 0;
    const merma = r.merma || 0;
    const bruto = r.cantidad_neta * (1 + merma / 100);
    return s + (cUnit * bruto);
  }, 0);

  panel.innerHTML = `
    <!-- Header sticky con acciones -->
    <div class="carta-form-header">
      <button class="carta-form-back" onclick="cartaCerrarForm()" title="Volver">
        <i class="ti ti-arrow-left"></i>
      </button>
      <div class="carta-form-title">${es_nuevo ? 'Nuevo producto' : p.nombre}</div>
      <div style="display:flex;gap:8px;margin-left:auto">
        <button class="carta-form-action-btn discard" onclick="cartaCerrarForm()" title="Descartar cambios">
          <i class="ti ti-x"></i><span>Descartar</span>
        </button>
        <button class="carta-form-action-btn save" onclick="cartaGuardarProducto()" title="Guardar">
          <i class="ti ti-device-floppy"></i><span>Guardar</span>
        </button>
        ${!es_nuevo ? `<button class="carta-form-del" onclick="cartaEliminarProducto('${p.id}')" title="Eliminar">
          <i class="ti ti-trash"></i>
        </button>` : ''}
      </div>
    </div>

    <div class="carta-form-body">
      <!-- Col izq: datos básicos -->
      <div class="carta-form-col">

        <div class="carta-form-section">Detalles</div>
        <div class="carta-field-group">
          <label class="carta-label">Nombre <span class="carta-req">*</span></label>
          <input id="cf-nombre" class="carta-input" type="text" value="${p?.nombre || ''}" />
        </div>
        <div class="carta-field-group">
          <label class="carta-label">Categoría <span class="carta-req">*</span></label>
          <select id="cf-categoria" class="carta-select">${cats}</select>
        </div>
        <div class="carta-field-row">
          <div class="carta-field-group">
            <label class="carta-label">Precio <span class="carta-req">*</span></label>
            <input id="cf-precio" class="carta-input" type="number" min="0"
              value="${p?.precio || ''}" oninput="cartaActualizarCostos()" />
          </div>
          <div class="carta-field-group">
            <label class="carta-label">Costo manual</label>
            <input id="cf-costo" class="carta-input" type="number" min="0"
              value="${p?.costo || ''}" placeholder="0" oninput="cartaActualizarCostos()" />
          </div>
        </div>
        <div class="carta-field-group">
          <label class="carta-label">Código interno</label>
          <input id="cf-codigo" class="carta-input" type="text" value="${p?.codigo || ''}" />
        </div>

        <div class="carta-form-section" style="margin-top:24px">Venta</div>
        <div class="carta-check-row">
          <label class="carta-check">
            <input type="checkbox" id="cf-activo" ${p?.activo !== false ? 'checked' : ''} />
            <span>Activo</span>
          </label>
          <label class="carta-check">
            <input type="checkbox" id="cf-solo" ${p?.permitir_vender_solo !== false ? 'checked' : ''} />
            <span>Permitir vender solo</span>
          </label>
        </div>
        <div class="carta-field-group" style="margin-top:8px">
          <label class="carta-label">Descripción</label>
          <textarea id="cf-desc" class="carta-textarea" rows="3">${p?.descripcion || ''}</textarea>
        </div>

        <div class="carta-form-section" style="margin-top:24px">Control de Stock</div>
        <div class="carta-check-row">
          <label class="carta-check">
            <input type="checkbox" id="cf-stock" ${p?.controlar_stock ? 'checked' : ''} />
            <span>Controlar stock</span>
          </label>
          <label class="carta-check">
            <input type="checkbox" id="cf-sinstock" ${p?.vender_sin_stock ? 'checked' : ''} />
            <span>Vender sin stock</span>
          </label>
        </div>

      </div><!-- /col izq -->

      <!-- Col der: receta, modificadores, costos -->
      <div class="carta-form-col">

        <div class="carta-form-section">Receta</div>
        <div id="cf-receta-lista" class="cf-receta-lista">
          ${_renderRecetaLineas()}
        </div>
        <button class="carta-add-mod-btn" onclick="cartaAbrirIngPicker()">
          <i class="ti ti-plus"></i> Agregar ingrediente
        </button>
        <button class="carta-add-mod-btn" style="margin-top:4px;color:#7c6fcf;border-color:#c4bfef" onclick="cartaAbrirPrepPickerProducto()">
          <i class="ti ti-flask"></i> Agregar preparación propia
        </button>

        <div class="carta-form-section" style="margin-top:24px">Grupos modificadores</div>
        <div id="cf-mods-lista" class="carta-mods-lista">
          ${_renderModsAsignados(p)}
        </div>
        <button class="carta-add-mod-btn" onclick="cartaAbrirPickerMod()">
          <i class="ti ti-plus"></i> Grupos modificadores
        </button>

        <div class="carta-form-section" style="margin-top:24px">Otros costos</div>
        <div class="carta-field-row">
          <div class="carta-field-group">
            <label class="carta-label">RRHH (mano de obra)</label>
            <input id="cf-rrhh" class="carta-input" type="number" min="0" step="1"
              value="${p?.costo_rrhh || ''}" placeholder="0" oninput="cartaActualizarCostos()" />
          </div>
        </div>

        <!-- Card costos (se actualiza dinámicamente) -->
        <div class="carta-form-section" style="margin-top:24px">Costos</div>
        <div class="carta-cost-card" id="cf-cost-card">
          ${_renderCostCard(p?.precio || 0, costoReceta || p?.costo || 0, p?.costo_rrhh || 0)}
        </div>

      </div><!-- /col der -->
    </div><!-- /form-body -->

    <!-- Picker ingredientes: click directo para agregar -->
    <div class="carta-ing-picker" id="carta-ing-picker" style="display:none">
      <div class="carta-mod-picker-header">
        Agregar ingrediente
        <button onclick="cartaCerrarIngPicker()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted)">×</button>
      </div>
      <div style="padding:10px 16px">
        <input class="carta-input" type="text" placeholder="Buscar ingrediente…"
          oninput="cartaFiltrarIng(this.value)" id="ing-search" autocomplete="off" />
      </div>
      <div class="carta-mod-picker-list" id="ing-picker-lista">
        ${_renderIngPickerLista('')}
      </div>
    </div>

    <!-- Picker preparaciones propias -->
    <div class="carta-ing-picker" id="carta-prep-picker-producto" style="display:none">
      <div class="carta-mod-picker-header" style="color:#7c6fcf">
        Agregar preparación propia
        <button onclick="cartaCerrarPrepPickerProducto()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted)">×</button>
      </div>
      <div style="padding:10px 16px">
        <input class="carta-input" type="text" placeholder="Buscar preparación…"
          oninput="cartaFiltrarPrepProducto(this.value)" id="prep-prod-search" autocomplete="off" />
      </div>
      <div class="carta-mod-picker-list" id="prep-prod-picker-lista">
        ${_renderPrepPickerLista('')}
      </div>
    </div>

    <!-- Picker modificadores -->
    <div class="carta-mod-picker" id="carta-mod-picker" style="display:none">
      <div class="carta-mod-picker-header">
        Grupos modificadores
        <button onclick="cartaCerrarPickerMod()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:20px">×</button>
      </div>
      <div class="carta-mod-picker-list">
        ${state.modificadores.map(m => `
          <label class="carta-mod-pick-item">
            <input type="checkbox" value="${m.id}" class="mod-picker-chk" />
            <span>${m.nombre}</span>
            <span style="margin-left:auto;font-size:11px;color:#888">${m.cantidad_min}–${m.cantidad_max}</span>
          </label>`).join('')}
      </div>
      <div style="padding:12px;border-top:1px solid var(--border)">
        <button class="carta-btn-save" style="width:100%" onclick="cartaConfirmarMods()">Agregar seleccionados</button>
      </div>
    </div>
  `;

  if (p) _cargarModsProducto(p.id);
}

// ── Receta ────────────────────────────────────────────────────────
const _UNIDADES_RECETA = ['unid.','g','kg','ml','l','cc','tbsp','tsp','pizca','porción'];

function _renderRecetaLineas() {
  if (!_receta.length) return `<div class="carta-mods-empty">Sin ingredientes aún</div>`;
  return _receta.map((r, i) => {
    const esPrep = !!r.preparacion_id;
    const nombre = esPrep ? (r.preparaciones?.nombre || '?') : (r.ingredientes?.nombre || '?');
    const cUnit  = esPrep ? (r.preparaciones?.costo_por_unidad || 0) : (r.ingredientes?.costo || 0);
    const merma  = r.merma || 0;
    const bruto  = r.cantidad_neta * (1 + merma / 100);
    const costo  = cUnit * bruto;
    const badge  = esPrep
      ? `<span style="font-size:9px;font-weight:700;background:rgba(124,111,207,.12);color:#7c6fcf;border-radius:4px;padding:1px 5px;margin-left:4px">PREP</span>`
      : '';
    return `
    <div class="cf-receta-row">
      <div class="cf-receta-ing">${nombre}${badge}</div>
      <input class="carta-input cf-receta-input" type="number" min="0" step="0.01"
        value="${r.cantidad_neta}"
        onchange="cartaActualizarRecetaLinea(${i}, 'cantidad_neta', this.value)" />
      <select class="carta-select cf-receta-sel"
        onchange="cartaActualizarRecetaLinea(${i}, 'unidad', this.value)">
        ${_UNIDADES_RECETA.map(u => `<option ${r.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
      </select>
      <div class="cf-receta-costo">${fmtPesos(costo)}</div>
      <button class="cf-receta-del" onclick="cartaQuitarRecetaLinea(${i})">
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
  const yaAgregados = new Set(_receta.map(r => r.ingrediente_id));
  return lista.slice(0, 80).map(i => {
    const agregado = yaAgregados.has(i.id);
    return `
    <div class="carta-mod-pick-item${agregado ? ' ing-ya-agregado' : ''}"
         onclick="cartaAgregarIng('${i.id}')" style="cursor:pointer">
      <span>${i.nombre}</span>
      <span style="margin-left:auto;font-size:11px;color:#888;white-space:nowrap">
        ${i.unidad || ''} · ${fmtPesos(i.costo)}/u
        ${agregado ? ' ✓' : ''}
      </span>
    </div>`;
  }).join('') || `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Sin resultados</div>`;
}

export function abrirIngPicker() {
  const picker = document.getElementById('carta-ing-picker');
  if (picker) picker.style.display = 'flex';
  const search = document.getElementById('ing-search');
  if (search) { search.value = ''; search.focus(); }
  document.getElementById('ing-picker-lista').innerHTML = _renderIngPickerLista('');
}

export function cerrarIngPicker() {
  const picker = document.getElementById('carta-ing-picker');
  if (picker) picker.style.display = 'none';
}

export function filtrarIng(val) {
  clearTimeout(_ingSearchTimer);
  _ingSearchTimer = setTimeout(() => {
    const lista = document.getElementById('ing-picker-lista');
    if (lista) lista.innerHTML = _renderIngPickerLista(val);
  }, 150);
}

export async function agregarIng(ingId) {
  const ing = state.ingredientes.find(i => i.id === ingId);
  if (!ing) return;

  const yaExiste = _receta.findIndex(r => r.ingrediente_id === ingId);
  if (yaExiste >= 0) {
    showToast(`${ing.nombre} ya está en la receta`, 'error');
    return;
  }

  const nuevaLinea = {
    ingrediente_id: ingId,
    cantidad_neta: 1,
    unidad: ing.unidad || 'unid.',
    merma: ing.merma || 0,
    ingredientes: ing,
  };

  if (_productoEditando) {
    const { data, error } = await supabase.from('recetas').insert({
      producto_id: _productoEditando.id,
      ingrediente_id: ingId,
      cantidad_neta: 1,
      unidad: ing.unidad || 'unid.',
      merma: ing.merma || 0,
    }).select('id').single();
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    nuevaLinea.id = data.id;
  }

  _receta.push(nuevaLinea);
  cerrarIngPicker();
  document.getElementById('cf-receta-lista').innerHTML = _renderRecetaLineas();
  _actualizarCostCard();
}

// ── Picker preparaciones (en producto) ───────────────────────────
function _renderPrepPickerLista(filtro) {
  const f = filtro.toLowerCase();
  const lista = f
    ? state.preparaciones.filter(p => p.nombre.toLowerCase().includes(f))
    : state.preparaciones;
  const yaAgregados = new Set(_receta.filter(r => r.preparacion_id).map(r => r.preparacion_id));
  if (!lista.length) return `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Sin preparaciones. Créalas en la pestaña "Preparaciones propias".</div>`;
  return lista.map(p => {
    const agregado = yaAgregados.has(p.id);
    return `
    <div class="carta-mod-pick-item${agregado ? ' ing-ya-agregado' : ''}"
         onclick="cartaAgregarPrepProducto('${p.id}')" style="cursor:pointer">
      <span>${p.nombre}</span>
      <span style="margin-left:auto;font-size:11px;color:#888;white-space:nowrap">
        ${p.unidad || ''} · ${fmtPesos(p.costo_por_unidad)}/u${agregado ? ' ✓' : ''}
      </span>
    </div>`;
  }).join('');
}

export function abrirPrepPickerProducto() {
  const picker = document.getElementById('carta-prep-picker-producto');
  if (picker) picker.style.display = 'flex';
  const search = document.getElementById('prep-prod-search');
  if (search) { search.value = ''; search.focus(); }
  document.getElementById('prep-prod-picker-lista').innerHTML = _renderPrepPickerLista('');
}

export function cerrarPrepPickerProducto() {
  const picker = document.getElementById('carta-prep-picker-producto');
  if (picker) picker.style.display = 'none';
}

export function filtrarPrepProducto(val) {
  const lista = document.getElementById('prep-prod-picker-lista');
  if (lista) lista.innerHTML = _renderPrepPickerLista(val);
}

export async function agregarPrepProducto(prepId) {
  const prep = state.preparaciones.find(p => p.id === prepId);
  if (!prep) return;
  if (_receta.find(r => r.preparacion_id === prepId)) {
    showToast(`${prep.nombre} ya está en la receta`, 'error'); return;
  }
  const nuevaLinea = {
    preparacion_id: prepId,
    cantidad_neta: 1,
    unidad: prep.unidad || 'unid.',
    merma: 0,
    preparaciones: prep,
  };
  if (_productoEditando) {
    const { data, error } = await supabase.from('recetas').insert({
      producto_id: _productoEditando.id,
      preparacion_id: prepId,
      cantidad_neta: 1,
      unidad: prep.unidad || 'unid.',
      merma: 0,
    }).select('id').single();
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    nuevaLinea.id = data.id;
  }
  _receta.push(nuevaLinea);
  cerrarPrepPickerProducto();
  document.getElementById('cf-receta-lista').innerHTML = _renderRecetaLineas();
  _actualizarCostCard();
}

// mantener compatibilidad con globales previos
export async function confirmarIng() {}
export function selIng() {}

export async function quitarRecetaLinea(idx) {
  const linea = _receta[idx];
  if (_productoEditando && linea?.id) {
    await supabase.from('recetas').delete().eq('id', linea.id);
  }
  _receta.splice(idx, 1);
  document.getElementById('cf-receta-lista').innerHTML = _renderRecetaLineas();
  _actualizarCostCard();
}

export async function actualizarRecetaLinea(idx, campo, valor) {
  if (!_receta[idx]) return;
  _receta[idx][campo] = campo === 'merma' || campo === 'cantidad_neta'
    ? parseFloat(valor) || 0 : valor;

  if (_productoEditando && _receta[idx].id) {
    const { cantidad_neta, unidad, merma } = _receta[idx];
    await supabase.from('recetas').update({ cantidad_neta, unidad, merma }).eq('id', _receta[idx].id);
  }
  _actualizarCostCard();
}

function _costoRecetaActual() {
  return _receta.reduce((s, r) => {
    const esPrep = !!r.preparacion_id;
    const cUnit  = esPrep ? (r.preparaciones?.costo_por_unidad || 0) : (r.ingredientes?.costo || 0);
    const merma  = r.merma || 0;
    const bruto  = (r.cantidad_neta || 0) * (1 + merma / 100);
    return s + cUnit * bruto;
  }, 0);
}

export function actualizarCostos() {
  _actualizarCostCard();
}

function _actualizarCostCard() {
  const precio     = parseFloat(document.getElementById('cf-precio')?.value) || 0;
  const costoManual= parseFloat(document.getElementById('cf-costo')?.value) || 0;
  const rrhh       = parseFloat(document.getElementById('cf-rrhh')?.value) || 0;
  const receta     = _costoRecetaActual();
  const costoFinal = receta > 0 ? receta : costoManual;
  const card = document.getElementById('cf-cost-card');
  if (card) card.innerHTML = _renderCostCard(precio, costoFinal, rrhh);
}

function _renderCostCard(precio, costoReceta, rrhh = 0) {
  const totalCostos = costoReceta + rrhh;
  const iva         = precio * 0.19;             // 19% del precio de venta
  const margenBruto = precio - totalCostos;
  const margenPct   = precio > 0 ? (margenBruto / precio * 100) : 0;
  const utilidad    = precio - totalCostos - iva; // precio - costos - IVA

  const row = (label, valor, cls = '') =>
    `<div class="carta-cost-row${cls ? ' ' + cls : ''}">
      <span>${label}</span><strong>${valor}</strong>
    </div>`;

  return `
    ${row('Costo receta', costoReceta ? fmtPesos(costoReceta) : '—')}
    ${rrhh ? row('RRHH', fmtPesos(rrhh)) : ''}
    ${row('Margen bruto', precio && totalCostos ? margenPct.toFixed(1) + '%  (' + fmtPesos(margenBruto) + ')' : '—', 'highlight')}
    <div class="carta-cost-divider"></div>
    ${row('Precio de venta', precio ? fmtPesos(precio) : '—')}
    ${row('IVA a pagar (19%)', precio ? fmtPesos(iva) : '—', 'muted')}
    ${row('Utilidad neta', precio && totalCostos ? fmtPesos(utilidad) : '—', utilidad > 0 ? 'highlight' : 'danger')}
  `;
}

// ── Modificadores ─────────────────────────────────────────────────
function _renderModsAsignados(p) {
  if (!p) return `<div class="carta-mods-empty">Sin grupos asignados</div>`;
  return `<div class="carta-mods-loading">Cargando…</div>`;
}

async function _cargarModsProducto(productoId) {
  const { data } = await supabase
    .from('producto_grupos_modificadores')
    .select('grupo_id, grupos_modificadores(nombre, cantidad_min, cantidad_max)')
    .eq('producto_id', productoId);
  const lista = document.getElementById('cf-mods-lista');
  if (!lista) return;
  if (!data?.length) {
    lista.innerHTML = `<div class="carta-mods-empty">Sin grupos asignados</div>`;
    return;
  }
  lista.innerHTML = data.map(d => `
    <div class="carta-mod-tag" data-id="${d.grupo_id}">
      <span>${d.grupos_modificadores.nombre}</span>
      <span style="font-size:11px;color:#888">${d.grupos_modificadores.cantidad_min}–${d.grupos_modificadores.cantidad_max}</span>
      <button onclick="cartaQuitarMod('${d.grupo_id}')" style="background:none;border:none;color:#888;cursor:pointer;margin-left:auto">×</button>
    </div>`).join('');
}

export function abrirPickerMod() {
  document.getElementById('carta-mod-picker').style.display = 'flex';
}
export function cerrarPickerMod() {
  document.getElementById('carta-mod-picker').style.display = 'none';
}
export async function confirmarMods() {
  if (!_productoEditando) return;
  const checks = document.querySelectorAll('.mod-picker-chk:checked');
  for (const chk of checks) {
    await supabase.from('producto_grupos_modificadores')
      .upsert({ producto_id: _productoEditando.id, grupo_id: chk.value });
  }
  cerrarPickerMod();
  _cargarModsProducto(_productoEditando.id);
}
export async function quitarMod(grupoId) {
  if (!_productoEditando) return;
  await supabase.from('producto_grupos_modificadores')
    .delete().eq('producto_id', _productoEditando.id).eq('grupo_id', grupoId);
  _cargarModsProducto(_productoEditando.id);
}

// ── Guardar ──────────────────────────────────────────────────────
export async function guardarProducto() {
  const nombre   = document.getElementById('cf-nombre')?.value?.trim();
  const catId    = document.getElementById('cf-categoria')?.value;
  const precio   = parseFloat(document.getElementById('cf-precio')?.value) || 0;
  const costoManual = parseFloat(document.getElementById('cf-costo')?.value) || 0;
  const costoRrhh   = parseFloat(document.getElementById('cf-rrhh')?.value)  || 0;
  const costoReceta = _costoRecetaActual();
  const costo    = costoReceta > 0 ? Math.round(costoReceta * 100) / 100 : costoManual;
  const codigo   = document.getElementById('cf-codigo')?.value?.trim();
  const activo   = document.getElementById('cf-activo')?.checked;
  const solo     = document.getElementById('cf-solo')?.checked;
  const stock    = document.getElementById('cf-stock')?.checked;
  const sinstock = document.getElementById('cf-sinstock')?.checked;
  const desc     = document.getElementById('cf-desc')?.value?.trim();

  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  if (!catId)  { showToast('Selecciona una categoría', 'error'); return; }

  const payload = {
    nombre, categoria_id: catId, precio, costo, costo_rrhh: costoRrhh,
    codigo: codigo || null, activo, permitir_vender_solo: solo,
    controlar_stock: stock, vender_sin_stock: sinstock,
    descripcion: desc || null,
  };

  let productoId = _productoEditando?.id;
  let error;

  if (_productoEditando) {
    ({ error } = await supabase.from('productos').update(payload).eq('id', productoId));
  } else {
    const res = await supabase.from('productos').insert(payload).select('id').single();
    error = res.error;
    productoId = res.data?.id;
  }

  if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }

  // Guardar receta si es producto nuevo
  if (!_productoEditando && productoId && _receta.length) {
    for (const r of _receta) {
      await supabase.from('recetas').insert({
        producto_id: productoId,
        ingrediente_id: r.ingrediente_id,
        cantidad_neta: r.cantidad_neta,
        unidad: r.unidad,
        merma: r.merma || 0,
      });
    }
  }

  showToast(_productoEditando ? 'Producto actualizado ✓' : 'Producto creado ✓');
  cerrarForm();
  await cargarProductos(state.categoriaActual);
  renderListaProductos();
}

// ── Eliminar ─────────────────────────────────────────────────────
export async function eliminarProducto(id) {
  if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
  const { error } = await supabase.from('productos').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Producto eliminado');
  cerrarForm();
  await cargarProductos(state.categoriaActual);
  renderListaProductos();
}
