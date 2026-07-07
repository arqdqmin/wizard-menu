import { supabase } from '/js/core/supabase.js';
import { state, showToast, fmtPesos, calcMargen, calcMarkup, cargarProductos } from './utils.js';

let _busqueda = '';
let _productoEditando = null;

// ── Render lista ─────────────────────────────────────────────────
export function renderListaProductos() {
  const tbody = document.getElementById('carta-tbody');
  if (!tbody) return;

  const filtrados = state.productos.filter(p => {
    if (!_busqueda) return true;
    return p.nombre.toLowerCase().includes(_busqueda.toLowerCase());
  });

  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="carta-empty-row">Sin productos en esta categoría</td></tr>`;
    document.getElementById('carta-count').textContent = '0 productos';
    return;
  }

  document.getElementById('carta-count').textContent = `${filtrados.length} producto${filtrados.length !== 1 ? 's' : ''}`;

  tbody.innerHTML = filtrados.map(p => {
    const margen  = calcMargen(p.precio, p.costo);
    const markup  = calcMarkup(p.precio, p.costo);
    const activo  = p.activo ? '' : 'carta-row-inactivo';
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

// ── Abrir form producto ──────────────────────────────────────────
export function abrirProducto(id) {
  _productoEditando = id === 'nuevo' ? null : state.productos.find(p => p.id === id);
  _renderForm(_productoEditando);
  document.getElementById('carta-form-panel').classList.add('open');
}

export function cerrarForm() {
  document.getElementById('carta-form-panel').classList.remove('open');
  _productoEditando = null;
}

function _renderForm(p) {
  const panel = document.getElementById('carta-form-panel');
  const es_nuevo = !p;
  const cats = state.categorias.map(c =>
    `<option value="${c.id}" ${p?.categoria_id === c.id ? 'selected' : ''}>${c.nombre}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="carta-form-header">
      <button class="carta-form-back" onclick="cartaCerrarForm()">
        <i class="ti ti-arrow-left"></i>
      </button>
      <div class="carta-form-title">${es_nuevo ? 'Nuevo producto' : p.nombre}</div>
      ${!es_nuevo ? `<button class="carta-form-del" onclick="cartaEliminarProducto('${p.id}')" title="Eliminar">
        <i class="ti ti-trash"></i>
      </button>` : ''}
    </div>

    <div class="carta-form-body">
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
            <input id="cf-precio" class="carta-input" type="number" min="0" value="${p?.precio || ''}" />
          </div>
          <div class="carta-field-group">
            <label class="carta-label">Costo (referencia)</label>
            <input id="cf-costo" class="carta-input" type="number" min="0" value="${p?.costo || ''}" placeholder="0" />
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
        <div class="carta-field-group" style="margin-top:12px">
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

      <div class="carta-form-col">

        <div class="carta-form-section">Grupos modificadores</div>
        <div id="cf-mods-lista" class="carta-mods-lista">
          ${_renderModsAsignados(p)}
        </div>
        <button class="carta-add-mod-btn" onclick="cartaAbrirPickerMod()">
          <i class="ti ti-plus"></i> Grupos modificadores
        </button>

        ${p ? `
        <div class="carta-form-section" style="margin-top:24px">Costos</div>
        <div class="carta-cost-card">
          <div class="carta-cost-row">
            <span>Precio venta</span><strong>${fmtPesos(p.precio)}</strong>
          </div>
          <div class="carta-cost-row">
            <span>Costo receta</span><strong>${fmtPesos(p.costo)}</strong>
          </div>
          <div class="carta-cost-row highlight">
            <span>Margen</span><strong>${calcMargen(p.precio, p.costo).toFixed(1)}%</strong>
          </div>
          <div class="carta-cost-row">
            <span>Markup</span><strong>${calcMarkup(p.precio, p.costo).toFixed(1)}%</strong>
          </div>
        </div>` : ''}

      </div><!-- /col der -->
    </div><!-- /form-body -->

    <div class="carta-form-footer">
      <button class="carta-btn-cancel" onclick="cartaCerrarForm()">Cancelar</button>
      <button class="carta-btn-save" onclick="cartaGuardarProducto()">
        <i class="ti ti-device-floppy"></i> Guardar
      </button>
    </div>

    <!-- Picker modificadores -->
    <div class="carta-mod-picker" id="carta-mod-picker" style="display:none">
      <div class="carta-mod-picker-header">
        Agregar grupo modificador
        <button onclick="cartaCerrarPickerMod()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:18px">×</button>
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

  // Cargar modificadores asignados si es producto existente
  if (p) _cargarModsProducto(p.id);
}

function _renderModsAsignados(p) {
  if (!p) return `<div class="carta-mods-empty">Sin grupos asignados</div>`;
  return `<div class="carta-mods-loading">Cargando…</div>`;
}

async function _cargarModsProducto(productoId) {
  const { data } = await supabase
    .from('producto_modificadores')
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
      <button onclick="cartaQuitarMod('${d.grupo_id}')" style="background:none;border:none;color:#888;cursor:pointer;margin-left:4px">×</button>
    </div>`).join('');
}

// ── Picker modificadores ─────────────────────────────────────────
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
    await supabase.from('producto_modificadores')
      .upsert({ producto_id: _productoEditando.id, grupo_id: chk.value });
  }
  cerrarPickerMod();
  _cargarModsProducto(_productoEditando.id);
}
export async function quitarMod(grupoId) {
  if (!_productoEditando) return;
  await supabase.from('producto_modificadores')
    .delete().eq('producto_id', _productoEditando.id).eq('grupo_id', grupoId);
  _cargarModsProducto(_productoEditando.id);
}

// ── Guardar ──────────────────────────────────────────────────────
export async function guardarProducto() {
  const nombre    = document.getElementById('cf-nombre')?.value?.trim();
  const catId     = document.getElementById('cf-categoria')?.value;
  const precio    = parseFloat(document.getElementById('cf-precio')?.value) || 0;
  const costo     = parseFloat(document.getElementById('cf-costo')?.value)  || 0;
  const codigo    = document.getElementById('cf-codigo')?.value?.trim();
  const activo    = document.getElementById('cf-activo')?.checked;
  const solo      = document.getElementById('cf-solo')?.checked;
  const stock     = document.getElementById('cf-stock')?.checked;
  const sinstock  = document.getElementById('cf-sinstock')?.checked;
  const desc      = document.getElementById('cf-desc')?.value?.trim();

  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  if (!catId)  { showToast('Selecciona una categoría', 'error'); return; }

  const payload = {
    nombre, categoria_id: catId, precio, costo,
    codigo: codigo || null, activo, permitir_vender_solo: solo,
    controlar_stock: stock, vender_sin_stock: sinstock,
    descripcion: desc || null,
  };

  let error;
  if (_productoEditando) {
    ({ error } = await supabase.from('productos').update(payload).eq('id', _productoEditando.id));
  } else {
    ({ error } = await supabase.from('productos').insert(payload));
  }

  if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }

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
