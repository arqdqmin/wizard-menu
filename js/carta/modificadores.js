import { supabase } from '/js/core/supabase.js';
import { state, showToast, fmtPesos, cargarModificadores } from './utils.js';

let _grupoEditando = null;
let _opciones = [];

// ── Tabla principal ───────────────────────────────────────────────
export function renderTabModificadores() {
  const el = document.getElementById('carta-tab-content');
  if (!el) return;

  el.innerHTML = `
    <div class="carta-tab-header">
      <h2 class="carta-tab-title">Grupos Modificadores</h2>
      <button class="carta-btn-primary" onclick="cartaAbrirFormMod()">
        <i class="ti ti-plus"></i> Nuevo grupo
      </button>
    </div>

    <table class="carta-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th style="text-align:center">Mín.</th>
          <th style="text-align:center">Máx.</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${state.modificadores.map(m => `
        <tr class="carta-row" onclick="cartaAbrirDetalleMod('${m.id}')">
          <td style="font-weight:500">${m.nombre}</td>
          <td style="text-align:center">${m.cantidad_min}</td>
          <td style="text-align:center">${m.cantidad_max}</td>
          <td><span class="carta-badge-${m.activo ? 'ok' : 'off'}">${m.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td>
            <button class="carta-icon-btn" onclick="event.stopPropagation();cartaEditarMod('${m.id}')">
              <i class="ti ti-pencil"></i>
            </button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>

    <!-- Modal crear/editar grupo -->
    <div class="carta-modal-backdrop" id="modal-mod" style="display:none">
      <div class="carta-modal">
        <div class="carta-modal-title" id="modal-mod-title">Nuevo grupo modificador</div>
        <input type="hidden" id="mod-id" />
        <div class="carta-field-group">
          <label class="carta-label">Nombre</label>
          <input id="mod-nombre" class="carta-input" type="text" />
        </div>
        <div class="carta-field-row">
          <div class="carta-field-group">
            <label class="carta-label">Cant. mínima</label>
            <input id="mod-min" class="carta-input" type="number" min="0" value="0" />
          </div>
          <div class="carta-field-group">
            <label class="carta-label">Cant. máxima</label>
            <input id="mod-max" class="carta-input" type="number" min="1" value="1" />
          </div>
        </div>
        <div class="carta-modal-footer">
          <button class="carta-btn-cancel" onclick="cartaCerrarModalMod()">Cancelar</button>
          <button class="carta-btn-save" onclick="cartaGuardarMod()">Guardar</button>
        </div>
      </div>
    </div>
  `;
}

// ── Modal crear/editar grupo ──────────────────────────────────────
export function abrirFormMod(id = null) {
  const m = id ? state.modificadores.find(x => x.id === id) : null;
  document.getElementById('modal-mod-title').textContent = m ? 'Editar grupo' : 'Nuevo grupo modificador';
  document.getElementById('mod-id').value     = m?.id || '';
  document.getElementById('mod-nombre').value = m?.nombre || '';
  document.getElementById('mod-min').value    = m?.cantidad_min ?? 0;
  document.getElementById('mod-max').value    = m?.cantidad_max ?? 1;
  document.getElementById('modal-mod').style.display = 'flex';
}

export function cerrarModalMod() {
  document.getElementById('modal-mod').style.display = 'none';
}

export async function guardarMod() {
  const id     = document.getElementById('mod-id').value;
  const nombre = document.getElementById('mod-nombre').value.trim();
  const min    = parseInt(document.getElementById('mod-min').value) || 0;
  const max    = parseInt(document.getElementById('mod-max').value) || 1;

  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  const payload = { nombre, cantidad_min: min, cantidad_max: max, activo: true };
  const { error } = id
    ? await supabase.from('grupos_modificadores').update(payload).eq('id', id)
    : await supabase.from('grupos_modificadores').insert(payload);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Grupo guardado ✓');
  cerrarModalMod();
  await cargarModificadores();
  renderTabModificadores();
}

// ── Panel detalle con opciones ────────────────────────────────────
export async function abrirDetalleMod(grupoId) {
  _grupoEditando = state.modificadores.find(m => m.id === grupoId);
  if (!_grupoEditando) return;

  const { data } = await supabase
    .from('grupo_modificador_opciones')
    .select('*')
    .eq('grupo_id', grupoId)
    .order('orden');
  _opciones = data || [];

  _renderDetalle();
  document.getElementById('mod-detalle-panel').classList.add('open');
}

export function cerrarDetalleMod() {
  document.getElementById('mod-detalle-panel').classList.remove('open');
  _grupoEditando = null;
  _opciones = [];
}

function _renderDetalle() {
  const panel = document.getElementById('mod-detalle-panel');
  const g = _grupoEditando;

  panel.innerHTML = `
    <div class="carta-form-header">
      <button class="carta-form-back" onclick="cartaCerrarDetalleMod()">
        <i class="ti ti-arrow-left"></i>
      </button>
      <div class="carta-form-title">${g.nombre}</div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="carta-form-action-btn discard" onclick="cartaEditarMod('${g.id}')">
          <i class="ti ti-pencil"></i><span>Editar grupo</span>
        </button>
      </div>
    </div>

    <div style="padding:24px;flex:1;overflow-y:auto">
      <!-- Info grupo -->
      <div style="display:flex;gap:24px;margin-bottom:24px;flex-wrap:wrap">
        <div class="carta-cost-card" style="flex:1;min-width:200px">
          <div class="carta-cost-row"><span>Cant. mínima</span><strong>${g.cantidad_min}</strong></div>
          <div class="carta-cost-row"><span>Cant. máxima</span><strong>${g.cantidad_max}</strong></div>
          <div class="carta-cost-row"><span>Estado</span>
            <span class="carta-badge-${g.activo ? 'ok' : 'off'}">${g.activo ? 'Activo' : 'Inactivo'}</span>
          </div>
        </div>
      </div>

      <!-- Opciones -->
      <div class="carta-tab-header" style="margin-bottom:16px">
        <h3 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Opciones</h3>
        <button class="carta-btn-primary" onclick="cartaAbrirFormOpcion()">
          <i class="ti ti-plus"></i> Agregar opción
        </button>
      </div>

      <table class="carta-table" id="mod-opciones-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th style="text-align:center">Cant. máx.</th>
            <th style="text-align:right">Precio adicional</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="mod-opciones-tbody">
          ${_renderOpcionesTbody()}
        </tbody>
      </table>
    </div>

    <!-- Modal opción -->
    <div class="carta-modal-backdrop" id="modal-opcion" style="display:none">
      <div class="carta-modal">
        <div class="carta-modal-title" id="modal-opcion-title">Nueva opción</div>
        <input type="hidden" id="opcion-id" />
        <div class="carta-field-group" style="position:relative">
          <label class="carta-label">Ingrediente <span class="carta-req">*</span></label>
          <input id="opcion-nombre" class="carta-input" type="text"
            placeholder="Buscar ingrediente…" autocomplete="off"
            oninput="cartaFiltrarOpcionIng(this.value)"
            onfocus="cartaFiltrarOpcionIng(this.value)" />
          <div id="opcion-ing-drop" class="mod-opcion-drop" style="display:none"></div>
        </div>
        <div class="carta-field-row">
          <div class="carta-field-group">
            <label class="carta-label">Cant. máxima</label>
            <input id="opcion-max" class="carta-input" type="number" min="1" value="1" />
          </div>
          <div class="carta-field-group">
            <label class="carta-label">Precio adicional ($)</label>
            <input id="opcion-precio" class="carta-input" type="number" min="0" value="0" placeholder="0" />
          </div>
        </div>
        <div class="carta-modal-footer">
          <button class="carta-btn-cancel" onclick="cartaCerrarModalOpcion()">Cancelar</button>
          <button class="carta-btn-save" onclick="cartaGuardarOpcion()">Guardar</button>
        </div>
      </div>
    </div>
  `;
}

function _renderOpcionesTbody() {
  if (!_opciones.length) {
    return `<tr><td colspan="5" class="carta-empty-row">Sin opciones — agrega la primera</td></tr>`;
  }
  return _opciones.map(o => `
    <tr class="carta-row">
      <td style="font-weight:500">${o.nombre}</td>
      <td style="text-align:center">${o.max_cantidad}</td>
      <td style="text-align:right">${o.precio_adicional ? fmtPesos(o.precio_adicional) : '<span style="color:var(--muted)">Sin cargo</span>'}</td>
      <td><span class="carta-badge-${o.activo ? 'ok' : 'off'}">${o.activo ? 'Activa' : 'Inactiva'}</span></td>
      <td style="display:flex;gap:6px">
        <button class="carta-icon-btn" onclick="cartaEditarOpcion('${o.id}')">
          <i class="ti ti-pencil"></i>
        </button>
        <button class="carta-icon-btn" onclick="cartaEliminarOpcion('${o.id}')" style="color:var(--danger)">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

// ── CRUD opciones ─────────────────────────────────────────────────
export function abrirFormOpcion(id = null) {
  const o = id ? _opciones.find(x => x.id === id) : null;
  document.getElementById('modal-opcion-title').textContent = o ? 'Editar opción' : 'Nueva opción';
  document.getElementById('opcion-id').value     = o?.id || '';
  document.getElementById('opcion-nombre').value = o?.nombre || '';
  document.getElementById('opcion-max').value    = o?.max_cantidad ?? 1;
  document.getElementById('opcion-precio').value = o?.precio_adicional ?? 0;
  document.getElementById('opcion-ing-drop').style.display = 'none';
  document.getElementById('modal-opcion').style.display = 'flex';
  setTimeout(() => document.getElementById('opcion-nombre')?.focus(), 80);
}

export function filtrarOpcionIng(val) {
  const drop = document.getElementById('opcion-ing-drop');
  if (!drop) return;
  const f = val.toLowerCase();
  const lista = f
    ? state.ingredientes.filter(i => i.nombre.toLowerCase().includes(f)).slice(0, 30)
    : state.ingredientes.slice(0, 30);
  if (!lista.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = lista.map(i => `
    <div class="mod-opcion-drop-item" onmousedown="cartaSelOpcionIng('${i.nombre.replace(/'/g,"\\'")}')">
      ${i.nombre}
      <span style="margin-left:auto;font-size:11px;color:var(--muted)">${i.unidad || ''}</span>
    </div>`).join('');
  drop.style.display = 'block';
}

export function selOpcionIng(nombre) {
  document.getElementById('opcion-nombre').value = nombre;
  document.getElementById('opcion-ing-drop').style.display = 'none';
}

export function cerrarModalOpcion() {
  document.getElementById('modal-opcion').style.display = 'none';
}

export async function guardarOpcion() {
  const id     = document.getElementById('opcion-id').value;
  const nombre = document.getElementById('opcion-nombre').value.trim();
  const max    = parseInt(document.getElementById('opcion-max').value) || 1;
  const precio = parseFloat(document.getElementById('opcion-precio').value) || 0;

  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  const payload = {
    grupo_id: _grupoEditando.id,
    nombre, max_cantidad: max, precio_adicional: precio, activo: true,
    orden: id ? undefined : _opciones.length,
  };
  if (id) delete payload.orden;

  const { error } = id
    ? await supabase.from('grupo_modificador_opciones').update(payload).eq('id', id)
    : await supabase.from('grupo_modificador_opciones').insert(payload);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast('Opción guardada ✓');
  cerrarModalOpcion();
  const { data } = await supabase
    .from('grupo_modificador_opciones').select('*')
    .eq('grupo_id', _grupoEditando.id).order('orden');
  _opciones = data || [];
  document.getElementById('mod-opciones-tbody').innerHTML = _renderOpcionesTbody();
}

export async function eliminarOpcion(id) {
  if (!confirm('¿Eliminar esta opción?')) return;
  const { error } = await supabase.from('grupo_modificador_opciones').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  _opciones = _opciones.filter(o => o.id !== id);
  document.getElementById('mod-opciones-tbody').innerHTML = _renderOpcionesTbody();
  showToast('Opción eliminada');
}
