import { supabase } from '/js/core/supabase.js';
import { state, showToast, cargarModificadores } from './utils.js';

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
        <tr class="carta-row">
          <td>${m.nombre}</td>
          <td style="text-align:center">${m.cantidad_min}</td>
          <td style="text-align:center">${m.cantidad_max}</td>
          <td><span class="carta-badge-${m.activo ? 'ok' : 'off'}">${m.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td>
            <button class="carta-icon-btn" onclick="cartaEditarMod('${m.id}')">
              <i class="ti ti-pencil"></i>
            </button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>

    <!-- Modal form modificador -->
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
