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

// Contexto de usuario y garzonas
let _garzonesData  = [];  // [{ id, nombre, apellido }]
let _currentUser   = null;
let _canEdit       = false;
let _mesaPersonas  = {};  // { mesaId: número }
let _mesaGarzon    = {};  // { mesaId: nombre }
let _mesaCasa      = {};  // { mesaId: 'gryffindor'|'hufflepuff'|'ravenclaw'|'slytherin'|null }

const CASAS = [
  { id: 'gryffindor', nombre: 'Gryffindor', emoji: '🦁', color: '#ae0001', text: '#ffd700' },
  { id: 'hufflepuff',  nombre: 'Hufflepuff',  emoji: '🦡', color: '#ecb939', text: '#372e29' },
  { id: 'ravenclaw',  nombre: 'Ravenclaw',  emoji: '🦅', color: '#0e1a40', text: '#946b2d' },
  { id: 'slytherin',  nombre: 'Slytherin',  emoji: '🐍', color: '#1a472a', text: '#aaaaaa' },
];

export function setUserContext(user, canEdit) { _currentUser = user; _canEdit = canEdit; }
export function setGarzonesData(data) { _garzonesData = data || []; }

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
  cuenta:   { bg: '#06b6d4', text: '#fff' },
  reservada:{ bg: '#a855f7', text: '#fff' },
};
const MESA_SIZE = 90; // px

export function renderPlano(planoEl) {
  planoEl.querySelectorAll('.pos-mesa').forEach(el => el.remove());

  mesas.forEach(mesa => {
    const c = ESTADO_COLOR[mesa.estado] || ESTADO_COLOR.libre;
    const personas = _mesaPersonas[mesa.id] || '';
    const el = document.createElement('div');
    el.className = 'pos-mesa';
    el.dataset.id = mesa.id;
    el.style.cssText = `
      position:absolute;
      left:${mesa.pos_x}px; top:${mesa.pos_y}px;
      width:${MESA_SIZE}px; height:${MESA_SIZE}px;
      background:${c.bg}; color:${c.text};
      border-radius:${mesa.forma === 'redondo' ? '50%' : '12px'};
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:2px;
      font-size:26px; font-weight:700;
      cursor:${editMode ? 'grab' : 'pointer'};
      user-select:none;
      box-shadow:0 2px 10px rgba(0,0,0,.22);
      transition:box-shadow .15s, transform .1s;
      border: ${mesaSelected?.id === mesa.id ? '3px solid #fff' : '3px solid transparent'};
    `;
    el.innerHTML = `
      <span>${mesa.numero}</span>
      ${personas ? `<span style="font-size:11px;font-weight:500;opacity:.85"><i class="ti ti-users" style="font-size:10px"></i> ${personas}</span>` : ''}
    `;
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
const DRAG_THRESHOLD = 6; // px de movimiento mínimo para iniciar drag

function onPointerDown(e, mesa, el, planoEl) {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;

  if (!editMode) {
    el.setPointerCapture(e.pointerId);
    el.addEventListener('pointerup', function up() {
      el.removeEventListener('pointerup', up);
      selectMesa(mesa, planoEl);
    });
    return;
  }

  const rect = planoEl.getBoundingClientRect();
  dragOffX = e.clientX - rect.left - mesa.pos_x;
  dragOffY = e.clientY - rect.top  - mesa.pos_y;
  dragging = { mesa, el };
  el.setPointerCapture(e.pointerId);

  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup',   onPointerUp);

  function onPointerMove(ev) {
    if (!moved) {
      if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD &&
          Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      el.style.cursor = 'grabbing';
      el.style.zIndex = 100;
    }
    const r    = planoEl.getBoundingClientRect();
    const rawX = ev.clientX - r.left - dragOffX;
    const rawY = ev.clientY - r.top  - dragOffY;
    const x = snapVal(Math.max(0, Math.min(rawX, r.width  - MESA_SIZE)));
    const y = snapVal(Math.max(0, Math.min(rawY, r.height - MESA_SIZE)));
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
    if (!moved) {
      // fue un click — seleccionar
      selectMesa(mesa, planoEl);
    } else if (dragging?.newX !== undefined) {
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
  const m  = mesaSelected;
  const c  = ESTADO_COLOR[m.estado] || ESTADO_COLOR.libre;
  const personas = _mesaPersonas[m.id] || 1;
  const garzonActual = _mesaGarzon[m.id] || '';

  // Si no es admin/super_admin → forzar garzón al usuario actual
  const esAdmin = _canEdit;
  const nombreUsuario = _currentUser ? (_currentUser.email || '').split('@')[0] : '';

  const garzonesOpts = _garzonesData.map(g => {
    const nombre = `${g.nombre} ${g.apellido || ''}`.trim();
    return `<option value="${nombre}" ${garzonActual === nombre ? 'selected' : ''}>${nombre}</option>`;
  }).join('');

  panelEl.innerHTML = `
    <div class="pos-mesa-detail">
      <!-- Cabecera -->
      <div class="pos-mesa-header" style="background:${c.bg}">
        <div class="pos-mesa-badge-lg">${m.numero}</div>
        <div>
          <div style="font-size:17px;font-weight:700">Mesa ${m.numero}</div>
          <div style="font-size:12px;opacity:.85;text-transform:capitalize">${m.estado} · cap. ${m.capacidad}</div>
        </div>
      </div>

      <!-- Estado rápido -->
      <div class="pos-detail-section">Estado</div>
      <div class="pos-estado-btns">
        ${['libre','ocupada','cuenta','reservada'].map(s =>
          `<button class="pos-estado-btn ${m.estado===s?'active':''}"
            style="${m.estado===s?`background:${ESTADO_COLOR[s].bg};color:#fff`:''}"
            onclick="posCambiarEstado('${m.id}','${s}')">
            ${s.charAt(0).toUpperCase()+s.slice(1)}
           </button>`
        ).join('')}
      </div>

      <!-- Personas -->
      <div class="pos-detail-section">Personas</div>
      <div class="pos-personas-row">
        <button class="pos-qty-btn" onclick="posChangePersonas('${m.id}',-1)"><i class="ti ti-minus"></i></button>
        <span id="pos-personas-val" class="pos-qty-val">${personas}</span>
        <button class="pos-qty-btn" onclick="posChangePersonas('${m.id}',1)"><i class="ti ti-plus"></i></button>
      </div>

      <!-- Garzón -->
      <div class="pos-detail-section">Garzón</div>
      ${esAdmin ? `
        <select class="pos-garzon-select" onchange="posSetGarzon('${m.id}',this.value)">
          <option value="">— Sin asignar —</option>
          ${garzonesOpts}
        </select>
      ` : `
        <div class="pos-garzon-name">${nombreUsuario}</div>
      `}

      <!-- Casa Harry Potter -->
      <div class="pos-detail-section">Casa</div>
      <div class="pos-casas-row">
        ${CASAS.map(casa => {
          const activa = (_mesaCasa[m.id] === casa.id);
          return `<button
            class="pos-casa-btn ${activa ? 'active' : ''}"
            title="${casa.nombre}"
            style="${activa
              ? `background:${casa.color};color:${casa.text};border-color:${casa.color};`
              : ''}"
            onclick="posToggleCasa('${m.id}','${casa.id}')">
            ${casa.emoji}
          </button>`;
        }).join('')}
      </div>
      ${_mesaCasa[m.id] ? (() => {
        const c = CASAS.find(x => x.id === _mesaCasa[m.id]);
        return `<div class="pos-casa-label" style="background:${c.color};color:${c.text}">${c.emoji} ${c.nombre}</div>`;
      })() : ''}

      <!-- Acciones -->
      <div style="margin-top:auto;padding-top:16px;display:flex;flex-direction:column;gap:8px">
        ${m.estado === 'libre' ? `
        <button class="pos-action-btn primary" onclick="posAbrirMesa('${m.id}')">
          <i class="ti ti-door-enter"></i> Abrir mesa
        </button>` : `
        <button class="pos-action-btn" onclick="posAbrirComanda('${m.id}')">
          <i class="ti ti-clipboard-list"></i> Ver comanda
        </button>`}
        ${editMode ? `
        <button class="pos-action-btn danger" onclick="posEliminarMesa('${m.id}')">
          <i class="ti ti-trash"></i> Eliminar mesa
        </button>` : ''}
      </div>
    </div>
  `;
}

export function changePersonas(mesaId, delta) {
  const current = _mesaPersonas[mesaId] || 1;
  const next = Math.max(1, Math.min(current + delta, 20));
  _mesaPersonas[mesaId] = next;
  const el = document.getElementById('pos-personas-val');
  if (el) el.textContent = next;
  // actualizar badge en plano
  renderPlano(document.getElementById('pos-plano'));
}

export function setGarzon(mesaId, nombre) {
  _mesaGarzon[mesaId] = nombre;
}

export function toggleCasa(mesaId, casaId) {
  _mesaCasa[mesaId] = (_mesaCasa[mesaId] === casaId) ? null : casaId;
  renderRightPanel(document.getElementById('pos-right-panel'));
  renderPlano(document.getElementById('pos-plano'));
}

export async function abrirMesa(id) {
  await cambiarEstado(id, 'ocupada');
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
