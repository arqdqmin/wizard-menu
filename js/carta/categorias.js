import { supabase } from '/js/core/supabase.js';
import { state, showToast, cargarCategorias } from './utils.js';

// ── Render sidebar de categorías ─────────────────────────────────
export function renderSidebarCategorias(onSelect) {
  const el = document.getElementById('carta-cats');
  if (!el) return;

  const byCocina = {};
  state.categorias.forEach(c => {
    const key = c.cocinas?.nombre || 'General';
    if (!byCocina[key]) byCocina[key] = [];
    byCocina[key].push(c);
  });

  let html = `
    <div class="carta-cat-item ${!state.categoriaActual ? 'active' : ''}"
         onclick="cartaSelCat(null)">
      <i class="ti ti-apps"></i> Todos
    </div>`;

  const orden = ['Barra/Pastelería', 'Cocina', 'General'];
  orden.forEach(cocina => {
    const cats = (byCocina[cocina] || []).filter(c => c.activa !== false);
    if (!cats?.length) return;
    html += `<div class="carta-cat-group">${cocina}</div>`;
    cats.forEach(c => {
      const activa = state.categoriaActual === c.id;
      html += `
        <div class="carta-cat-item ${activa ? 'active' : ''}"
             onclick="cartaSelCat('${c.id}')">
          ${c.nombre}
        </div>`;
    });
  });

  el.innerHTML = html;
}

// ── Tab: Categorías ──────────────────────────────────────────────
export function renderTabCategorias() {
  const el = document.getElementById('carta-tab-content');
  if (!el) return;

  el.innerHTML = `
    <div class="carta-tab-header">
      <h2 class="carta-tab-title">Categorías de Productos</h2>
      <button class="carta-btn-primary" onclick="cartaAbrirFormCat()">
        <i class="ti ti-plus"></i> Nueva categoría
      </button>
    </div>

    <table class="carta-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Cocina / Área de impresión</th>
          <th>Orden</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${state.categorias.map(c => `
        <tr class="carta-row">
          <td>${c.nombre}</td>
          <td>${c.cocinas?.nombre || '<span style="color:#888">Sin cocina</span>'}</td>
          <td>${c.orden}</td>
          <td>
            <button class="carta-badge-${c.activa ? 'ok' : 'off'}"
              style="border:none;cursor:pointer;font-size:11px;font-weight:600;padding:2px 8px;border-radius:5px;background:${c.activa ? '#f0fdf4' : '#fef2f2'};color:${c.activa ? '#16a34a' : '#dc2626'}"
              onclick="cartaToggleCatActiva('${c.id}',${!c.activa})" title="${c.activa ? 'Ocultar categoría' : 'Mostrar categoría'}">
              ${c.activa ? 'Visible' : 'Oculta'}
            </button>
          </td>
          <td>
            <button class="carta-icon-btn" onclick="cartaEditarCat('${c.id}')">
              <i class="ti ti-pencil"></i>
            </button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>

    <!-- Modal form categoría -->
    <div class="carta-modal-backdrop" id="modal-cat" style="display:none">
      <div class="carta-modal">
        <div class="carta-modal-title" id="modal-cat-title">Nueva categoría</div>
        <input type="hidden" id="cat-id" />
        <div class="carta-field-group">
          <label class="carta-label">Nombre</label>
          <input id="cat-nombre" class="carta-input" type="text" />
        </div>
        <div class="carta-field-group">
          <label class="carta-label">Cocina (área de impresión)</label>
          <select id="cat-cocina" class="carta-select">
            <option value="">— Sin cocina —</option>
            ${state.cocinas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="carta-field-group">
          <label class="carta-label">Orden</label>
          <input id="cat-orden" class="carta-input" type="number" value="${state.categorias.length + 1}" />
        </div>
        <div class="carta-modal-footer">
          <button class="carta-btn-cancel" onclick="cartaCerrarModalCat()">Cancelar</button>
          <button class="carta-btn-save" onclick="cartaGuardarCat()">Guardar</button>
        </div>
      </div>
    </div>
  `;
}

export function abrirFormCat(id = null) {
  const cat = id ? state.categorias.find(c => c.id === id) : null;
  document.getElementById('modal-cat-title').textContent = cat ? 'Editar categoría' : 'Nueva categoría';
  document.getElementById('cat-id').value    = cat?.id || '';
  document.getElementById('cat-nombre').value = cat?.nombre || '';
  document.getElementById('cat-cocina').value = cat?.cocina_id || '';
  document.getElementById('cat-orden').value  = cat?.orden ?? state.categorias.length + 1;
  document.getElementById('modal-cat').style.display = 'flex';
}

export function cerrarModalCat() {
  document.getElementById('modal-cat').style.display = 'none';
}

export async function toggleCatActiva(id, activa) {
  const { error } = await supabase.from('categorias_productos').update({ activa }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  await cargarCategorias();
  renderTabCategorias();
  renderSidebarCategorias();
}

export async function guardarCat() {
  const id     = document.getElementById('cat-id').value;
  const nombre = document.getElementById('cat-nombre').value.trim();
  const cocina = document.getElementById('cat-cocina').value || null;
  const orden  = parseInt(document.getElementById('cat-orden').value) || 0;

  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  const payload = { nombre, cocina_id: cocina, orden, activa: true };
  const { error } = id
    ? await supabase.from('categorias_productos').update(payload).eq('id', id)
    : await supabase.from('categorias_productos').insert(payload);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Categoría guardada ✓');
  cerrarModalCat();
  await cargarCategorias();
  renderTabCategorias();
}
