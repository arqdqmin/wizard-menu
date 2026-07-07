import { supabase } from '/js/core/supabase.js';
import { state, showToast, fmtPesos, cargarIngredientes } from './utils.js';

let _ingEditando = null;

// ── Render tabla ──────────────────────────────────────────────────
export function renderTabIngredientes() {
  const el = document.getElementById('carta-tab-content');
  if (!el) return;

  el.innerHTML = `
    <div class="carta-tab-header">
      <h2 class="carta-tab-title">Ingredientes</h2>
      <button class="carta-btn-primary" onclick="cartaAbrirIngForm()">
        <i class="ti ti-plus"></i> Nuevo ingrediente
      </button>
    </div>

    <div class="carta-search-bar" style="margin-bottom:16px">
      <div class="carta-search-wrap">
        <i class="ti ti-search"></i>
        <input class="carta-search-input" type="text"
          placeholder="Buscar ingrediente…"
          oninput="cartaFiltrarIngTab(this.value)" id="ing-tab-search" />
      </div>
      <span class="carta-count" id="ing-tab-count"></span>
    </div>

    <table class="carta-table" id="ing-tabla">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Categoría</th>
          <th>Unidad</th>
          <th style="text-align:right">Costo/u</th>
          <th>Proveedor</th>
          <th style="text-align:center">Stock</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="ing-tbody"></tbody>
    </table>

    <!-- Slide-in form -->
    <div class="carta-form-panel" id="ing-form-panel">
      <div id="ing-form-inner"></div>
    </div>
  `;

  _renderIngTabla(state.ingredientes);
}

function _renderIngTabla(lista) {
  const tbody = document.getElementById('ing-tbody');
  const count = document.getElementById('ing-tab-count');
  if (!tbody) return;
  if (count) count.textContent = `${lista.length} ingrediente${lista.length !== 1 ? 's' : ''}`;
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="carta-empty-row">Sin ingredientes</td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map(i => `
    <tr class="carta-row" onclick="cartaAbrirIngForm('${i.id}')">
      <td style="font-weight:500">${i.nombre}</td>
      <td style="color:var(--muted);font-size:12px">${i.categoria || '—'}</td>
      <td>${i.unidad || '—'}</td>
      <td style="text-align:right">${fmtPesos(i.costo)}</td>
      <td style="color:var(--muted);font-size:12px">${i.proveedor || '—'}</td>
      <td style="text-align:center">
        <span class="carta-badge-${i.controlar_stock ? 'ok' : 'off'}">${i.controlar_stock ? 'Sí' : 'No'}</span>
      </td>
      <td>
        <button class="carta-icon-btn" onclick="event.stopPropagation();cartaEliminarIng('${i.id}')">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

let _ingBusqueda = '';
export function filtrarIngTab(val) {
  _ingBusqueda = val.toLowerCase();
  const lista = state.ingredientes.filter(i =>
    i.nombre.toLowerCase().includes(_ingBusqueda) ||
    (i.categoria || '').toLowerCase().includes(_ingBusqueda) ||
    (i.proveedor || '').toLowerCase().includes(_ingBusqueda)
  );
  _renderIngTabla(lista);
}

// ── Form ─────────────────────────────────────────────────────────
export function abrirIngForm(id = null) {
  _ingEditando = id ? state.ingredientes.find(i => i.id === id) : null;
  _renderIngForm(_ingEditando);
  document.getElementById('ing-form-panel').classList.add('open');
}

export function cerrarIngForm() {
  document.getElementById('ing-form-panel').classList.remove('open');
  _ingEditando = null;
}

const UNIDADES = ['unid.','g','kg','ml','l','cc','tbsp','tsp','pizca','porción'];

function _renderIngForm(ing) {
  document.getElementById('ing-form-inner').innerHTML = `
    <div class="carta-form-header">
      <button class="carta-form-back" onclick="cartaCerrarIngForm()">
        <i class="ti ti-arrow-left"></i>
      </button>
      <div class="carta-form-title">${ing ? ing.nombre : 'Nuevo ingrediente'}</div>
      <div style="display:flex;gap:8px;margin-left:auto">
        <button class="carta-form-action-btn discard" onclick="cartaCerrarIngForm()">
          <i class="ti ti-x"></i><span>Descartar</span>
        </button>
        <button class="carta-form-action-btn save" onclick="cartaGuardarIng()">
          <i class="ti ti-device-floppy"></i><span>Guardar</span>
        </button>
        ${ing ? `<button class="carta-form-del" onclick="cartaEliminarIng('${ing.id}')" title="Eliminar">
          <i class="ti ti-trash"></i>
        </button>` : ''}
      </div>
    </div>

    <div class="carta-form-body" style="grid-template-columns:1fr 1fr">
      <div class="carta-form-col">
        <div class="carta-form-section">Datos básicos</div>
        <div class="carta-field-group">
          <label class="carta-label">Nombre <span class="carta-req">*</span></label>
          <input id="ing-nombre" class="carta-input" type="text" value="${ing?.nombre || ''}" />
        </div>
        <div class="carta-field-group">
          <label class="carta-label">Categoría</label>
          <input id="ing-categoria" class="carta-input" type="text" value="${ing?.categoria || ''}"
            placeholder="Ej: Lácteos y huevos" list="ing-cats-list" />
          <datalist id="ing-cats-list">
            ${[...new Set(state.ingredientes.map(i => i.categoria).filter(Boolean))].sort()
              .map(c => `<option value="${c}">`).join('')}
          </datalist>
        </div>
        <div class="carta-field-row">
          <div class="carta-field-group">
            <label class="carta-label">Costo por unidad <span class="carta-req">*</span></label>
            <input id="ing-costo" class="carta-input" type="number" min="0" step="0.01"
              value="${ing?.costo || ''}" placeholder="0" />
          </div>
          <div class="carta-field-group">
            <label class="carta-label">Unidad</label>
            <select id="ing-unidad-sel" class="carta-select">
              ${UNIDADES.map(u => `<option ${ing?.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="carta-field-group">
          <label class="carta-label">Proveedor</label>
          <input id="ing-proveedor" class="carta-input" type="text" value="${ing?.proveedor || ''}" />
        </div>
      </div>

      <div class="carta-form-col">
        <div class="carta-form-section">Stock</div>
        <div class="carta-check-row">
          <label class="carta-check">
            <input type="checkbox" id="ing-stock" ${ing?.controlar_stock ? 'checked' : ''} />
            <span>Controlar stock</span>
          </label>
          <label class="carta-check">
            <input type="checkbox" id="ing-activo" ${ing?.activo !== false ? 'checked' : ''} />
            <span>Activo</span>
          </label>
        </div>
        <div class="carta-field-group" style="margin-top:12px">
          <label class="carta-label">Merma % (predeterminada)</label>
          <input id="ing-merma" class="carta-input" type="number" min="0" step="0.1"
            value="${ing?.merma || 0}" />
        </div>
      </div>
    </div>
  `;
}

// ── Guardar / Eliminar ────────────────────────────────────────────
export async function guardarIng() {
  const nombre  = document.getElementById('ing-nombre')?.value?.trim();
  const costo   = parseFloat(document.getElementById('ing-costo')?.value) || 0;
  const unidad  = document.getElementById('ing-unidad-sel')?.value || 'unid.';
  const cat     = document.getElementById('ing-categoria')?.value?.trim() || null;
  const prov    = document.getElementById('ing-proveedor')?.value?.trim() || null;
  const stock   = document.getElementById('ing-stock')?.checked;
  const activo  = document.getElementById('ing-activo')?.checked;
  const merma   = parseFloat(document.getElementById('ing-merma')?.value) || 0;

  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  const payload = { nombre, costo, unidad, categoria: cat, proveedor: prov,
    controlar_stock: stock, activo, merma };

  let error;
  if (_ingEditando) {
    ({ error } = await supabase.from('ingredientes').update(payload).eq('id', _ingEditando.id));
  } else {
    ({ error } = await supabase.from('ingredientes').insert(payload));
  }

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(_ingEditando ? 'Ingrediente actualizado ✓' : 'Ingrediente creado ✓');
  cerrarIngForm();
  await cargarIngredientes();
  renderTabIngredientes();
}

export async function eliminarIng(id) {
  if (!confirm('¿Eliminar este ingrediente? Se eliminará de todas las recetas.')) return;
  const { error } = await supabase.from('ingredientes').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Ingrediente eliminado');
  if (document.getElementById('ing-form-panel')?.classList.contains('open')) cerrarIngForm();
  await cargarIngredientes();
  renderTabIngredientes();
}
