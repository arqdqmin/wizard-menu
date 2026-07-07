import { supabase } from '/js/core/supabase.js';

// ── Estado ───────────────────────────────────────────────────────
let zonas        = [];
let mesas        = [];
let zonaActual   = null;
let editMode     = false;
let mesaSelected = null;
let snapToGrid   = true;
const GRID_SIZE  = 100;

// Drag state
let dragging = null;
let dragOffX = 0;
let dragOffY = 0;

function snapVal(v) {
  return snapToGrid ? Math.round(v / GRID_SIZE) * GRID_SIZE : v;
}

// ── Carga ────────────────────────────────────────────────────────
export async function loadZonas() {
  const { data, error } = await supabase.from('zonas').select('*').eq('activa', true).order('orden');
  if (error) { showPosToast('Error al cargar zonas', 'error'); return []; }
  zonas = data || [];
  return zonas;
}

export async function loadMesas(zonaId) {
  const { data, error } = await supabase.from('mesas').select('*')
    .eq('zona_id', zonaId).eq('activa', true).order('numero');
  if (error) { showPosToast('Error al cargar mesas', 'error'); return []; }
  mesas = data || [];
  return mesas;
}

// ── Render tabs de zona ──────────────────────────────────────────
export function renderZonaTabs(containerEl, onSwitch) {
  containerEl.innerHTML = zonas.map(z =>
    `<button class="pos-zone-tab ${zonaActual?.id === z.id ? 'active' : ''}"
             data-id="${z.id}">${z.nombre}</button>`
  ).join('');
  containerEl.querySelectorAll('.pos-zone-tab').forEach(btn => {
    btn.addEventListener('click', () => switchZona(btn.dataset.id, containerEl, onSwitch));
  });
}

async function switchZona(id, tabsEl, onSwitch) {
  zonaActual = zonas.find(z => z.id === id) || null;
  tabsEl.querySelectorAll('.pos-zone-tab').forEach(b => b.classList.toggle('active', b.dataset.id === id));
  await loadMesas(id);
  mesaSelected = null;
  renderRightPanel(document.getElementById('pos-right-panel'));
  onSwitch();
}

// ── Render plano ─────────────────────────────────────────────────
const ESTADO_COLOR = {
  libre:    { bg: '#22c55e', text: '#fff' },
  ocupada:  { bg: '#f97316', text: '#fff' },
  cuenta:   { bg: '#ef4444', text: '#fff' },
  reservada:{ bg: '#a855f7', text: '#fff' },
};

export function renderPlano(planoEl) {
  // Limpiar mesas previas (mantener overlay si existe)
  planoEl.querySelectorAll('.pos-mesa').forEach(el => el.remove());

  mesas.forEach(mesa => {
    const c = ESTADO_COLOR[mesa.estado] || ESTADO_COLOR.libre;
    const el = document.createElement('div');
    el.className = 'pos-mesa';
    el.dataset.id = mesa.id;
    el.style.cssText = `
      position:absolute;
      left:${mesa.pos_x}px; top:${mesa.pos_y}px;
      width:80px; height:80px;
      background:${c.bg}; color:${c.text};
      border-radius:${mesa.forma === 'redondo' ? '50%' : '10px'};
      display:flex; align-items:center; justify-content:center;
      font-size:22px; font-weight:700;
      cursor:${editMode ? 'grab' : 'pointer'};
      user-select:none;
      box-shadow:0 2px 8px rgba(0,0,0,.18);
      transition:box-shadow .15s, transform .1s;
      border: ${mesaSelected?.id === mesa.id ? '3px solid #fff' : '3px solid transparent'};
    `;
    el.textContent = mesa.numero;
    el.title = `Mesa ${mesa.numero} · ${mesa.estado}`;

    // Hover
    el.addEventListener('mouseenter', () => { if(!dragging) el.style.transform = 'scale(1.07)'; });
    el.addEventListener('mouseleave', () => { if(!dragging) el.style.transform = ''; });

    // Pointer events para drag y click
    el.addEventListener('pointerdown', e => onPointerDown(e, mesa, el, planoEl));
    planoEl.appendChild(el);
  });
}

// ── Drag & Drop ──────────────────────────────────────────────────
function onPointerDown(e, mesa, el, planoEl) {
  if (!editMode) {
    selectMesa(mesa, planoEl);
    return;
  }
  e.preventDefault();
  const rect = planoEl.getBoundingClientRect();
  dragOffX = e.clientX - rect.left - mesa.pos_x;
  dragOffY = e.clientY - rect.top  - mesa.pos_y;
  dragging = { mesa, el };
  el.style.cursor = 'grabbing';
  el.style.zIndex = 100;
  el.setPointerCapture(e.pointerId);

  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup',   onPointerUp);

  function onPointerMove(ev) {
    const r   = planoEl.getBoundingClientRect();
    const rawX = ev.clientX - r.left - dragOffX;
    const rawY = ev.clientY - r.top  - dragOffY;
    const x = snapVal(Math.max(0, Math.min(rawX, r.width  - GRID_SIZE)));
    const y = snapVal(Math.max(0, Math.min(rawY, r.height - GRID_SIZE)));
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    dragging.newX = x;
    dragging.newY = y;
  }

  async function onPointerUp() {
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup',   onPointerUp);
    el.style.cursor = 'grab';
    el.style.zIndex = '';
    if (dragging && dragging.newX !== undefined) {
      await saveMesaPosition(mesa.id, dragging.newX, dragging.newY);
      mesa.pos_x = dragging.newX;
      mesa.pos_y = dragging.newY;
    }
    dragging = null;
  }
}

// ── Snap to grid toggle ──────────────────────────────────────────
export function toggleSnapToGrid(btnEl) {
  snapToGrid = !snapToGrid;
  const plano = document.getElementById('pos-plano');
  if (snapToGrid) {
    plano.classList.add('grid-visible');
    btnEl.classList.add('active');
    btnEl.title = 'Snap to grid: ON';
  } else {
    plano.classList.remove('grid-visible');
    btnEl.classList.remove('active');
    btnEl.title = 'Snap to grid: OFF';
  }
}

export function initGrid(planoEl) {
  if (snapToGrid) planoEl.classList.add('grid-visible');
}

async function saveMesaPosition(id, x, y) {
  await supabase.from('mesas').update({ pos_x: x, pos_y: y, updated_at: new Date().toISOString() }).eq('id', id);
}

// ── Selección de mesa ────────────────────────────────────────────
function selectMesa(mesa, planoEl) {
  mesaSelected = mesa;
  renderPlano(planoEl);
  renderRightPanel(document.getElementById('pos-right-panel'));
}

export function renderRightPanel(panelEl) {
  if (!panelEl) return;
  if (!mesaSelected) {
    panelEl.innerHTML = `<div class="pos-right-empty"><i class="ti ti-layout-grid" style="font-size:36px;color:var(--pos-muted)"></i><p>Selecciona una mesa</p></div>`;
    return;
  }
  const m = mesaSelected;
  const c = ESTADO_COLOR[m.estado] || ESTADO_COLOR.libre;
  panelEl.innerHTML = `
    <div class="pos-mesa-detail">
      <div class="pos-mesa-badge" style="background:${c.bg}">${m.numero}</div>
      <div class="pos-detail-nombre">Mesa ${m.numero}</div>
      <div class="pos-detail-meta">${m.capacidad} personas · ${m.forma}</div>
      <div class="pos-estado-label" style="color:${c.bg};font-weight:600;margin-top:4px;text-transform:capitalize">${m.estado}</div>

      <div class="pos-detail-section">Estado</div>
      <div class="pos-estado-btns">
        ${['libre','ocupada','cuenta','reservada'].map(s =>
          `<button class="pos-estado-btn ${m.estado===s?'active':''}" style="${m.estado===s?`background:${ESTADO_COLOR[s].bg};color:#fff`:''}"
           onclick="posCambiarEstado('${m.id}','${s}')">${s.charAt(0).toUpperCase()+s.slice(1)}</button>`
        ).join('')}
      </div>

      <div class="pos-detail-section">Acciones</div>
      <button class="pos-action-btn" onclick="posAbrirComanda('${m.id}')">
        <i class="ti ti-clipboard-list"></i> Abrir comanda
      </button>
      ${editMode ? `
      <button class="pos-action-btn danger" onclick="posEliminarMesa('${m.id}')">
        <i class="ti ti-trash"></i> Eliminar mesa
      </button>` : ''}
    </div>
  `;
}

// ── Estado de mesa ───────────────────────────────────────────────
export async function cambiarEstado(id, nuevoEstado) {
  const { error } = await supabase.from('mesas').update({ estado: nuevoEstado, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showPosToast('Error al actualizar estado', 'error'); return; }
  const m = mesas.find(x => x.id === id);
  if (m) m.estado = nuevoEstado;
  if (mesaSelected?.id === id) mesaSelected.estado = nuevoEstado;
  const plano = document.getElementById('pos-plano');
  renderPlano(plano);
  renderRightPanel(document.getElementById('pos-right-panel'));
}

// ── Agregar mesa ─────────────────────────────────────────────────
export async function addMesa(numero, capacidad, forma) {
  if (!zonaActual) { showPosToast('Selecciona una zona primero', 'error'); return; }
  if (!numero.trim()) { showPosToast('El número de mesa es obligatorio', 'error'); return; }
  const { data, error } = await supabase.from('mesas').insert({
    numero: numero.trim(), zona_id: zonaActual.id,
    capacidad: Number(capacidad) || 4,
    forma: forma || 'cuadrado',
    pos_x: 50 + (mesas.length % 8) * 100,
    pos_y: 50 + Math.floor(mesas.length / 8) * 120,
    estado: 'libre', activa: true,
  }).select().single();
  if (error) { showPosToast('Error al agregar mesa: ' + error.message, 'error'); return; }
  mesas.push(data);
  renderPlano(document.getElementById('pos-plano'));
  showPosToast('Mesa agregada ✓');
}

// ── Eliminar mesa ────────────────────────────────────────────────
export async function eliminarMesa(id) {
  if (!confirm('¿Eliminar esta mesa? Se perderá su posición en el plano.')) return;
  const { error } = await supabase.from('mesas').update({ activa: false }).eq('id', id);
  if (error) { showPosToast('Error al eliminar', 'error'); return; }
  mesas = mesas.filter(m => m.id !== id);
  if (mesaSelected?.id === id) mesaSelected = null;
  renderPlano(document.getElementById('pos-plano'));
  renderRightPanel(document.getElementById('pos-right-panel'));
  showPosToast('Mesa eliminada');
}

// ── Edit mode ────────────────────────────────────────────────────
export function toggleEditMode(btnEl) {
  editMode = !editMode;
  btnEl.textContent = editMode ? '✓ Guardar posiciones' : '✎ Editar plano';
  btnEl.style.background = editMode ? '#22c55e' : '';
  btnEl.style.color = editMode ? '#fff' : '';
  document.getElementById('pos-add-mesa-btn').style.display = editMode ? 'flex' : 'none';
  renderPlano(document.getElementById('pos-plano'));
  renderRightPanel(document.getElementById('pos-right-panel'));
}

// ── Zonas — agregar ──────────────────────────────────────────────
export async function addZona(nombre) {
  if (!nombre.trim()) return;
  const { data, error } = await supabase.from('zonas').insert({
    nombre: nombre.trim(), orden: zonas.length + 1,
  }).select().single();
  if (error) { showPosToast('Error al agregar zona', 'error'); return; }
  zonas.push(data);
  showPosToast('Zona agregada ✓');
  return data;
}

// ── Toast ────────────────────────────────────────────────────────
let _toastTimer = null;
function showPosToast(msg, type) {
  const el = document.getElementById('pos-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'pos-toast visible' + (type === 'error' ? ' error' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), type === 'error' ? 5000 : 2500);
}

export function getZonas() { return zonas; }
export function getMesas() { return mesas; }
export function isEditMode() { return editMode; }
