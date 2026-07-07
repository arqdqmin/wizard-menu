import { supabase } from '/js/core/supabase.js';

// ── Estado principal ─────────────────────────────────────────────
let zonas        = [];
let mesas        = [];
let zonaActual   = null;
let editMode     = false;
let mesaSelected = null;
let snapToGrid   = true;
const GRID_SIZE  = 100;
let dragging = null, dragOffX = 0, dragOffY = 0;

// Contexto de usuario
let _garzonesData = [], _currentUser = null, _canEdit = false;
let _mesaPersonas = {}, _mesaGarzon  = {}, _mesaCasa = {}, _mesaHora = {};

// Catálogo de productos + grupos modificadores
let _productos      = [];
let _productoGrupos = {};  // productoId → [{id, nombre, min, max, opciones:[]}]

// Comanda por mesa (dos cubetas: pending y confirmed)
let _pendingItems   = {};  // mesaId → [ item ]
let _confirmedItems = {};  // mesaId → [ item ]
//  item: { localId, id(productoId), nombre, precio, cantidad, grupos:[{grupo_id, nombre, opcion_id, opcion_nombre, precio_adicional, opciones:[]}], comentario, showComment }
let _localId = 0;

// Panel "Editar venta" activo
let _editingMesaId = null;

// Descuentos por mesa
let _descuentos   = {};  // mesaId → { tipo: '%'|'$', valor: number }
let _showDescuento = {}; // mesaId → boolean

// Estado del checkout (modal de cobro)
let _co    = null;   // { mesaId, propinas:[{metodo,monto}], pagos:[{metodo,monto}] }
let _coIdx = 0;
const CO_METODOS = ['Efectivo', 'Tarj. Débito', 'Tarj. Crédito', 'Transferencia'];

// Precio unitario incluyendo precio_adicional de modificadores seleccionados
function _precioItem(item) {
  const adicional = (item.grupos||[]).reduce((s,g) => s + (Number(g.precio_adicional)||0), 0);
  return (Number(item.precio)||0) + adicional;
}

const CASAS = [
  { id: 'gryffindor', nombre: 'Gryffindor', emoji: '🦁', color: '#ae0001', text: '#ffd700' },
  { id: 'hufflepuff',  nombre: 'Hufflepuff',  emoji: '🦡', color: '#ecb939', text: '#372e29' },
  { id: 'ravenclaw',  nombre: 'Ravenclaw',  emoji: '🦅', color: '#0e1a40', text: '#946b2d' },
  { id: 'slytherin',  nombre: 'Slytherin',  emoji: '🐍', color: '#1a472a', text: '#aaaaaa' },
];

export const ESTADO_COLOR = {
  libre:    { bg: '#22c55e', text: '#fff' },
  ocupada:  { bg: '#f97316', text: '#fff' },
  cuenta:   { bg: '#06b6d4', text: '#fff' },
  reservada:{ bg: '#a855f7', text: '#fff' },
};
const MESA_SIZE = 90;

// ── Helpers ──────────────────────────────────────────────────────
function _fmtPesos(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
}
function _esc(s) {
  return String(s || '').replace(/'/g, "\\'");
}
export function setUserContext(user, canEdit) { _currentUser = user; _canEdit = canEdit; }
export function setGarzonesData(data)         { _garzonesData = data || []; }

// ── Carga de datos ───────────────────────────────────────────────
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

export async function loadProductos() {
  const { data } = await supabase
    .from('productos')
    .select('id, nombre, precio, activo, categoria_id, categorias_productos(id, nombre, cocinas(id, nombre))')
    .eq('activo', true)
    .order('nombre');
  _productos = data || [];
}

async function _loadGruposForProducto(productoId) {
  if (_productoGrupos[productoId] !== undefined) return _productoGrupos[productoId];
  const { data } = await supabase
    .from('producto_grupos_modificadores')
    .select('orden, grupos_modificadores(id, nombre, cantidad_min, cantidad_max, grupo_modificador_opciones(id, nombre, precio_adicional, activo, orden))')
    .eq('producto_id', productoId)
    .order('orden');
  _productoGrupos[productoId] = (data || [])
    .map(r => r.grupos_modificadores)
    .filter(Boolean)
    .map(g => ({
      id: g.id, nombre: g.nombre, min: g.cantidad_min, max: g.cantidad_max,
      opciones: (g.grupo_modificador_opciones || []).filter(o => o.activo !== false).sort((a, b) => a.orden - b.orden),
    }));
  return _productoGrupos[productoId];
}

// ── Snap / grid ──────────────────────────────────────────────────
function snapVal(v) { return snapToGrid ? Math.round(v / GRID_SIZE) * GRID_SIZE : v; }

export function toggleSnapToGrid(btnEl) {
  snapToGrid = !snapToGrid;
  const plano = document.getElementById('pos-plano');
  plano.classList.toggle('grid-visible', snapToGrid);
  btnEl.classList.toggle('active', snapToGrid);
  btnEl.title = 'Snap to grid: ' + (snapToGrid ? 'ON' : 'OFF');
}
export function initGrid(planoEl) { if (snapToGrid) planoEl.classList.add('grid-visible'); }

// ── Tabs de zona ─────────────────────────────────────────────────
export function renderZonaTabs(containerEl, onSwitch) {
  containerEl.innerHTML = zonas.map(z =>
    `<button class="pos-zone-tab ${zonaActual?.id === z.id ? 'active' : ''}" data-id="${z.id}">${z.nombre}</button>`
  ).join('');
  containerEl.querySelectorAll('.pos-zone-tab').forEach(btn => {
    btn.addEventListener('click', () => _switchZona(btn.dataset.id, containerEl, onSwitch));
  });
}

async function _switchZona(id, tabsEl, onSwitch) {
  zonaActual = zonas.find(z => z.id === id) || null;
  tabsEl.querySelectorAll('.pos-zone-tab').forEach(b => b.classList.toggle('active', b.dataset.id === id));
  await loadMesas(id);
  mesaSelected = null;
  renderRightPanel(document.getElementById('pos-right-panel'));
  onSwitch();
}

// ── Plano ────────────────────────────────────────────────────────
export function renderPlano(planoEl) {
  planoEl.querySelectorAll('.pos-mesa').forEach(el => el.remove());
  mesas.forEach(mesa => {
    const c        = ESTADO_COLOR[mesa.estado] || ESTADO_COLOR.libre;
    const personas = _mesaPersonas[mesa.id] || '';
    const nPending = (_pendingItems[mesa.id]   || []).reduce((s, i) => s + i.cantidad, 0);
    const nConfirm = (_confirmedItems[mesa.id] || []).reduce((s, i) => s + i.cantidad, 0);
    const el = document.createElement('div');
    el.className = 'pos-mesa';
    el.dataset.id = mesa.id;
    el.style.cssText = `position:absolute;left:${mesa.pos_x}px;top:${mesa.pos_y}px;
      width:${MESA_SIZE}px;height:${MESA_SIZE}px;
      background:${c.bg};color:${c.text};
      border-radius:${mesa.forma==='redondo'?'50%':'12px'};
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
      font-size:26px;font-weight:700;
      cursor:${editMode?'grab':'pointer'};user-select:none;
      box-shadow:0 2px 10px rgba(0,0,0,.22);transition:box-shadow .15s,transform .1s;
      border:${mesaSelected?.id===mesa.id?'3px solid #fff':'3px solid transparent'};`;
    el.innerHTML = `<span>${mesa.numero}</span>
      ${personas ? `<span style="font-size:11px;font-weight:500;opacity:.85"><i class="ti ti-users" style="font-size:10px"></i> ${personas}</span>` : ''}
      ${nConfirm ? `<span style="font-size:10px;font-weight:600;background:rgba(0,0,0,.25);padding:1px 6px;border-radius:10px">${nConfirm}</span>` : ''}
      ${nPending ? `<span style="font-size:9px;font-weight:600;background:rgba(255,255,255,.25);padding:1px 5px;border-radius:8px">+${nPending}</span>` : ''}`;
    el.title = `Mesa ${mesa.numero} · ${mesa.estado}`;
    el.addEventListener('mouseenter', () => { if (!dragging) el.style.transform = 'scale(1.07)'; });
    el.addEventListener('mouseleave', () => { if (!dragging) el.style.transform = ''; });
    el.addEventListener('pointerdown', e => _onPointerDown(e, mesa, el, planoEl));
    planoEl.appendChild(el);
  });
}

function _onPointerDown(e, mesa, el, planoEl) {
  e.preventDefault();
  const startX = e.clientX, startY = e.clientY;
  let moved = false;

  if (!editMode) {
    el.setPointerCapture(e.pointerId);
    el.addEventListener('pointerup', function up() {
      el.removeEventListener('pointerup', up);
      _selectMesa(mesa, planoEl);
    });
    return;
  }

  const rect = planoEl.getBoundingClientRect();
  dragOffX = e.clientX - rect.left - mesa.pos_x;
  dragOffY = e.clientY - rect.top  - mesa.pos_y;
  dragging = { mesa, el };
  el.setPointerCapture(e.pointerId);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup',   onUp);

  function onMove(ev) {
    if (!moved && Math.abs(ev.clientX-startX) < 6 && Math.abs(ev.clientY-startY) < 6) return;
    moved = true; el.style.cursor='grabbing'; el.style.zIndex=100;
    const r=planoEl.getBoundingClientRect();
    const x=snapVal(Math.max(0,Math.min(ev.clientX-r.left-dragOffX, r.width-MESA_SIZE)));
    const y=snapVal(Math.max(0,Math.min(ev.clientY-r.top-dragOffY,  r.height-MESA_SIZE)));
    el.style.left=x+'px'; el.style.top=y+'px';
    dragging.newX=x; dragging.newY=y;
  }
  async function onUp() {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup',   onUp);
    el.style.cursor='grab'; el.style.zIndex='';
    if (!moved) _selectMesa(mesa, planoEl);
    else if (dragging?.newX !== undefined) {
      await supabase.from('mesas').update({ pos_x:dragging.newX, pos_y:dragging.newY }).eq('id', mesa.id);
      mesa.pos_x=dragging.newX; mesa.pos_y=dragging.newY;
    }
    dragging=null;
  }
}

async function _selectMesa(mesa, planoEl) {
  mesaSelected = mesa;
  _editingMesaId = null;
  renderPlano(planoEl);
  const panel = document.getElementById('pos-right-panel');
  // Si es mesa ocupada y aún no tiene ítems en memoria, cargar desde DB
  if (['ocupada', 'cuenta'].includes(mesa.estado)) {
    await _syncConfirmedFromDB(mesa.id);
  }
  renderRightPanel(panel);
}

// Carga ítems confirmados desde pos_comandas — siempre al seleccionar la mesa
async function _syncConfirmedFromDB(mesaId) {
  const { data: comandas, error } = await supabase
    .from('pos_comandas')
    .select('id, hora_inicio, pos_comanda_items(id, nombre, precio, cantidad, comentario, modificadores)')
    .eq('mesa_id', mesaId)
    .in('estado', ['pendiente', 'preparando', 'listo']);   // excluye 'cerrado'
  if (error) { console.error('sync comandas:', error); return; }
  if (!comandas?.length) {
    _confirmedItems[mesaId] = [];
    return;
  }
  // Ordenar comandas por hora_inicio para respetar el orden de llegada
  comandas.sort((a, b) => new Date(a.hora_inicio) - new Date(b.hora_inicio));
  _confirmedItems[mesaId] = comandas.flatMap(c =>
    (c.pos_comanda_items || []).map(i => ({
      localId: ++_localId,
      id:       null,
      nombre:   i.nombre,
      precio:   Number(i.precio) || 0,
      cantidad: i.cantidad,
      grupos:   (i.modificadores || []).map(m => ({ opcion_nombre: m.opcion || m.nombre || '' })),
      comentario:  i.comentario || '',
      showComment: false,
    }))
  );
  // Restaurar hora de apertura a partir de la comanda más antigua
  if (!_mesaHora[mesaId]) _mesaHora[mesaId] = new Date(comandas[0].hora_inicio);
}

// ── Panel derecho ────────────────────────────────────────────────
export function renderRightPanel(panelEl) {
  if (!panelEl) return;
  if (!mesaSelected) {
    panelEl.innerHTML = `<div class="pos-right-empty"><i class="ti ti-layout-grid" style="font-size:36px;color:var(--pos-muted)"></i><p>Selecciona una mesa</p></div>`;
    return;
  }
  const m = mesaSelected;
  const isOcupada = ['ocupada', 'cuenta'].includes(m.estado);
  if (isOcupada) _renderComandaPanel(panelEl, m);
  else           _renderInfoPanel(panelEl, m);
}

// ── Panel comanda ────────────────────────────────────────────────
function _renderComandaPanel(panelEl, m) {
  if (_editingMesaId === m.id) { _renderEditarVenta(panelEl, m); return; }

  const c        = ESTADO_COLOR[m.estado] || ESTADO_COLOR.ocupada;
  const personas = _mesaPersonas[m.id] || 1;
  const hora     = _mesaHora[m.id];
  const horaStr  = hora ? hora.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',hour12:false}) : '';
  const confirmed = _confirmedItems[m.id] || [];
  const pending   = _pendingItems[m.id]   || [];
  const subtotalConfirmed = confirmed.reduce((s,i) => s + _precioItem(i)*i.cantidad, 0);
  const pendingTotal      = pending.reduce  ((s,i) => s + _precioItem(i)*i.cantidad, 0);
  const desc = _descuentos[m.id];
  const descMonto = desc?.valor ? (desc.tipo === '%' ? Math.round(subtotalConfirmed * desc.valor / 100) : Math.min(desc.valor, subtotalConfirmed)) : 0;
  const confirmedTotal = subtotalConfirmed - descMonto;
  const showDesc = !!_showDescuento[m.id];

  panelEl.innerHTML = `
    <div class="pos-mesa-detail">
      <!-- Cabecera -->
      <div class="pos-mesa-header" style="background:${c.bg}">
        <div class="pos-mesa-badge-lg">${m.numero}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:17px;font-weight:700">Mesa ${m.numero}</div>
          <div style="font-size:12px;opacity:.85">${personas} persona${personas!==1?'s':''}${horaStr?' · '+horaStr:''}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="pos-hdr-btn" onclick="posVerPreCuenta('${m.id}')" title="Pre-cuenta">
            <i class="ti ti-receipt"></i>
          </button>
          <button class="pos-hdr-btn" onclick="posEditarVenta('${m.id}')" title="Editar venta">
            <i class="ti ti-transfer"></i>
          </button>
        </div>
      </div>

      <!-- Estado mini -->
      <div style="display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid var(--pos-border)">
        <button style="flex:1;padding:5px;border-radius:6px;border:1px solid ${m.estado==='ocupada'?'transparent':'var(--pos-border)'};
          background:${m.estado==='ocupada'?ESTADO_COLOR.ocupada.bg:'none'};
          color:${m.estado==='ocupada'?'#fff':'var(--pos-muted)'};cursor:pointer;font-size:11px;font-weight:500;font-family:inherit"
          onclick="posCambiarEstado('${m.id}','ocupada')">Ocupada</button>
        <button style="flex:1;padding:5px;border-radius:6px;border:1px solid ${m.estado==='cuenta'?'transparent':'var(--pos-border)'};
          background:${m.estado==='cuenta'?ESTADO_COLOR.cuenta.bg:'none'};
          color:${m.estado==='cuenta'?'#fff':'var(--pos-muted)'};cursor:pointer;font-size:11px;font-weight:500;font-family:inherit"
          onclick="posCambiarEstado('${m.id}','cuenta')">Pre-cuenta</button>
      </div>

      <!-- Buscador — justo debajo de estado, dropdown hacia abajo -->
      <div style="padding:10px 12px;border-bottom:1px solid var(--pos-border);flex-shrink:0">
        <div style="position:relative">
          <input type="text" id="cmd-search-${m.id}" autocomplete="off"
            style="width:100%;padding:8px 12px;border-radius:7px;border:1px solid var(--pos-border);background:var(--pos-bg);color:var(--pos-text);font-family:inherit;font-size:13px;outline:none"
            placeholder="Buscar producto…"
            oninput="posFiltrarProductos('${m.id}',this.value)"
            onfocus="posFiltrarProductos('${m.id}',this.value)"
            onblur="setTimeout(()=>{const d=document.getElementById('cmd-drop-${m.id}');if(d)d.style.display='none'},150)" />
          <div id="cmd-drop-${m.id}"
            style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--pos-surface);
              border:1px solid var(--pos-border);border-radius:8px;max-height:220px;overflow-y:auto;
              z-index:50;margin-top:4px;box-shadow:0 6px 20px rgba(0,0,0,.5)"></div>
        </div>
      </div>

      <!-- Ítems confirmados -->
      <div style="flex:1;overflow-y:auto;min-height:0">
        <div id="confirmed-list-${m.id}">${_renderConfirmedItems(m.id)}</div>

        <!-- Ítems pendientes -->
        ${pending.length ? `
          <div style="padding:6px 12px 4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--pos-accent);border-top:1px dashed var(--pos-border)">
            Pendiente de confirmar
          </div>
          <div id="pending-list-${m.id}">${_renderPendingItems(m.id)}</div>
        ` : `<div id="pending-list-${m.id}"></div>`}
      </div>

      <!-- Botones confirmar (solo si hay pending) -->
      ${pending.length ? `
        <div style="padding:10px 12px;border-top:1px dashed var(--pos-border);background:rgba(184,152,42,.08)">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
            <span style="font-size:12px;color:var(--pos-muted)">Total a confirmar</span>
            <span style="font-size:16px;font-weight:700;color:var(--pos-accent)">${_fmtPesos(pendingTotal)}</span>
          </div>
          <div style="display:flex;gap:8px">
            <button style="flex:1;padding:9px;border-radius:7px;border:1px solid var(--pos-border);background:none;color:var(--pos-muted);cursor:pointer;font-family:inherit;font-size:13px;font-weight:500"
              onclick="posCancelarPendientes('${m.id}')">Cancelar</button>
            <button style="flex:2;padding:9px;border-radius:7px;border:none;background:var(--pos-accent);color:#111;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700"
              onclick="posConfirmarPedidos('${m.id}')">Confirmar</button>
          </div>
        </div>` : ''}

      <!-- Footer total + cerrar -->
      <div style="padding:12px;border-top:2px solid var(--pos-border);background:rgba(0,0,0,.15);flex-shrink:0">
        ${showDesc ? `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;background:rgba(255,255,255,.05);border-radius:8px;padding:8px">
          <label style="font-size:11px;color:var(--pos-muted);white-space:nowrap">Descuento</label>
          <label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:3px">
            <input type="radio" name="desc-tipo-${m.id}" value="%" ${!desc||desc.tipo==='%'?'checked':''} onchange="posSetDescTipo('${m.id}','%')"> %
          </label>
          <label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:3px">
            <input type="radio" name="desc-tipo-${m.id}" value="$" ${desc?.tipo==='$'?'checked':''} onchange="posSetDescTipo('${m.id}','$')"> $
          </label>
          <input id="desc-val-${m.id}" type="number" min="0" value="${desc?.valor||''}" placeholder="0"
            style="width:70px;padding:4px 6px;border-radius:6px;border:1px solid var(--pos-border);background:rgba(0,0,0,.3);color:var(--pos-text);font-size:13px"
            onkeydown="if(event.key==='Enter')posAplicarDescuento('${m.id}')">
          <button onclick="posAplicarDescuento('${m.id}')" style="padding:4px 10px;border-radius:6px;background:var(--pos-accent);color:#fff;border:none;cursor:pointer;font-size:12px">OK</button>
          ${descMonto>0 ? `<span style="margin-left:auto;font-size:12px;color:#f87;white-space:nowrap">-${_fmtPesos(descMonto)}</span>` : ''}
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:13px;color:var(--pos-muted)">Total</span>
            <button onclick="posToglDesc('${m.id}')" title="Descuento"
              style="background:${descMonto>0?'var(--pos-accent)':'rgba(255,255,255,.1)'};border:none;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:${descMonto>0?'#fff':'var(--pos-muted)'}">
              <i class="ti ti-tag"></i> %/$
            </button>
          </div>
          <span id="comanda-total-${m.id}" style="font-size:20px;font-weight:700">${_fmtPesos(confirmedTotal)}</span>
        </div>
        <button class="pos-action-btn danger" onclick="posCerrarMesa('${m.id}')">
          <i class="ti ti-door-exit"></i> Cerrar mesa ${m.numero}
        </button>
      </div>
    </div>`;
}

function _renderConfirmedItems(mesaId) {
  const items = _confirmedItems[mesaId] || [];
  if (!items.length) {
    return `<div style="text-align:center;padding:20px 16px;color:var(--pos-muted);font-size:12px;opacity:.5">
      <i class="ti ti-clipboard-list" style="font-size:28px;display:block;margin-bottom:6px"></i>Comanda vacía
    </div>`;
  }
  return items.map((item, idx) => {
    const mods = item.grupos?.filter(g => g.opcion_nombre) || [];
    return `<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04)">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.nombre}</div>
          ${mods.length ? `<div style="font-size:11px;color:var(--pos-muted)">${mods.map(g=>g.opcion_nombre).join(' · ')}</div>` : ''}
          ${item.comentario ? `<div style="font-size:11px;color:var(--pos-accent);font-style:italic">💬 ${item.comentario}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <button style="${_qtyBtnStyle()}" onmousedown="posChangeConfirmedQty('${mesaId}',${idx},-1)">−</button>
          <span style="min-width:18px;text-align:center;font-size:13px;font-weight:600">${item.cantidad}</span>
          <button style="${_qtyBtnStyle()}" onmousedown="posChangeConfirmedQty('${mesaId}',${idx},1)">+</button>
        </div>
        <div style="min-width:56px;text-align:right;font-size:13px;font-weight:600">${_fmtPesos(_precioItem(item)*item.cantidad)}</div>
        <button style="width:22px;height:22px;border-radius:5px;border:none;background:none;color:var(--pos-muted);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center"
          onmousedown="posToggleCommentC('${mesaId}',${idx})"><i class="ti ti-message"></i></button>
        <button style="width:22px;height:22px;border-radius:5px;border:none;background:none;color:#ef4444;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center"
          onmousedown="posEliminarConfirmado('${mesaId}',${idx})"><i class="ti ti-x"></i></button>
      </div>
      ${item.showComment ? `<textarea
        style="width:100%;margin-top:6px;padding:6px 8px;border-radius:6px;border:1px solid var(--pos-border);background:var(--pos-bg);color:var(--pos-text);font-family:inherit;font-size:12px;resize:none;height:52px;outline:none"
        placeholder="Comentario…"
        oninput="posSetCommentC('${mesaId}',${idx},this.value)">${item.comentario || ''}</textarea>` : ''}
    </div>`;
  }).join('');
}

function _renderPendingItems(mesaId) {
  const items = _pendingItems[mesaId] || [];
  return items.map((item, idx) => {
    const mods = item.grupos || [];
    return `<div style="padding:8px 12px;border-bottom:1px solid rgba(184,152,42,.15);background:rgba(184,152,42,.05)">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;font-size:13px;font-weight:500">${item.nombre}</div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <button style="${_qtyBtnStyle()}" onmousedown="posChangePendingQty('${mesaId}',${idx},-1)">−</button>
          <span style="min-width:18px;text-align:center;font-size:13px;font-weight:600">${item.cantidad}</span>
          <button style="${_qtyBtnStyle()}" onmousedown="posChangePendingQty('${mesaId}',${idx},1)">+</button>
        </div>
        <div style="min-width:56px;text-align:right;font-size:13px;font-weight:600;color:var(--pos-accent)">${_fmtPesos(_precioItem(item)*item.cantidad)}</div>
        <button style="width:22px;height:22px;border-radius:5px;border:none;background:none;color:var(--pos-muted);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center"
          onmousedown="posToggleCommentP('${mesaId}',${idx})"><i class="ti ti-message"></i></button>
        <button style="width:22px;height:22px;border-radius:5px;border:none;background:none;color:#ef4444;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center"
          onmousedown="posEliminarPendiente('${mesaId}',${idx})"><i class="ti ti-x"></i></button>
      </div>
      ${mods.length ? `<div style="display:flex;flex-direction:column;gap:5px;margin-top:7px">
        ${mods.map((g, gi) => `
          <select style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--pos-border);background:var(--pos-bg);color:${g.opcion_id?'var(--pos-text)':'var(--pos-muted)'};font-family:inherit;font-size:12px;outline:none"
            onchange="posSetGrupoOpcion('${mesaId}',${idx},${gi},this.value,this.options[this.selectedIndex].text)">
            <option value="">--- ${g.nombre} ---</option>
            ${g.opciones.map(o => `<option value="${o.id}" ${g.opcion_id===o.id?'selected':''}>${o.nombre}${o.precio_adicional?` (+${_fmtPesos(o.precio_adicional)})`:''}</option>`).join('')}
          </select>`).join('')}
      </div>` : ''}
      ${item.showComment ? `<textarea
        style="width:100%;margin-top:6px;padding:6px 8px;border-radius:6px;border:1px solid var(--pos-border);background:var(--pos-bg);color:var(--pos-text);font-family:inherit;font-size:12px;resize:none;height:52px;outline:none"
        placeholder="Comentario…"
        oninput="posSetCommentP('${mesaId}',${idx},this.value)">${item.comentario || ''}</textarea>` : ''}
    </div>`;
  }).join('');
}

function _qtyBtnStyle() {
  return 'width:22px;height:22px;border-radius:5px;border:1px solid var(--pos-border);background:none;color:var(--pos-text);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;line-height:1';
}

// ── Panel info (mesa libre/reservada) ────────────────────────────
function _renderInfoPanel(panelEl, m) {
  const c  = ESTADO_COLOR[m.estado] || ESTADO_COLOR.libre;
  const personas = _mesaPersonas[m.id] || 1;
  const garzonActual = _mesaGarzon[m.id] || '';
  const garzonesOpts = _garzonesData.map(g => {
    const nombre = `${g.nombre} ${g.apellido||''}`.trim();
    return `<option value="${nombre}" ${garzonActual===nombre?'selected':''}>${nombre}</option>`;
  }).join('');

  panelEl.innerHTML = `
    <div class="pos-mesa-detail">
      <div class="pos-mesa-header" style="background:${c.bg}">
        <div class="pos-mesa-badge-lg">${m.numero}</div>
        <div>
          <div style="font-size:17px;font-weight:700">Mesa ${m.numero}</div>
          <div style="font-size:12px;opacity:.85;text-transform:capitalize">${m.estado} · cap. ${m.capacidad}</div>
        </div>
      </div>
      <div class="pos-detail-section">Estado</div>
      <div class="pos-estado-btns">
        ${['libre','ocupada','cuenta','reservada'].map(s =>
          `<button class="pos-estado-btn ${m.estado===s?'active':''}"
            style="${m.estado===s?`background:${ESTADO_COLOR[s].bg};color:#fff`:''}"
            onclick="posCambiarEstado('${m.id}','${s}')">
            ${s==='cuenta'?'Pre-cuenta':s.charAt(0).toUpperCase()+s.slice(1)}
           </button>`).join('')}
      </div>
      <div class="pos-detail-section">Personas</div>
      <div class="pos-personas-row">
        <button class="pos-qty-btn" onclick="posChangePersonas('${m.id}',-1)"><i class="ti ti-minus"></i></button>
        <span id="pos-personas-val" class="pos-qty-val">${personas}</span>
        <button class="pos-qty-btn" onclick="posChangePersonas('${m.id}',1)"><i class="ti ti-plus"></i></button>
      </div>
      <div class="pos-detail-section">Garzón</div>
      ${_canEdit ? `
        <select class="pos-garzon-select" onchange="posSetGarzon('${m.id}',this.value)">
          <option value="">— Sin asignar —</option>${garzonesOpts}
        </select>` : `<div class="pos-garzon-name">${_currentUser?.email?.split('@')[0]||''}</div>`}
      <div class="pos-detail-section">Casa</div>
      <div class="pos-casas-row">
        ${CASAS.map(casa => {
          const activa = _mesaCasa[m.id]===casa.id;
          return `<button class="pos-casa-btn ${activa?'active':''}" title="${casa.nombre}"
            style="${activa?`background:${casa.color};color:${casa.text};border-color:${casa.color};`:''}"
            onclick="posToggleCasa('${m.id}','${casa.id}')">${casa.emoji}</button>`;
        }).join('')}
      </div>
      ${_mesaCasa[m.id] ? (() => {
        const casa=CASAS.find(x=>x.id===_mesaCasa[m.id]);
        return `<div class="pos-casa-label" style="background:${casa.color};color:${casa.text}">${casa.emoji} ${casa.nombre}</div>`;
      })() : ''}
      <div style="margin-top:auto;padding-top:16px;display:flex;flex-direction:column;gap:8px">
        <button class="pos-action-btn primary" onclick="posAbrirMesa('${m.id}')">
          <i class="ti ti-door-enter"></i> Abrir mesa
        </button>
        ${editMode ? `<button class="pos-action-btn danger" onclick="posEliminarMesa('${m.id}')">
          <i class="ti ti-trash"></i> Eliminar mesa
        </button>` : ''}
      </div>
    </div>`;
}

// ── Panel "Editar venta" ─────────────────────────────────────────
function _renderEditarVenta(panelEl, m) {
  const personas = _mesaPersonas[m.id] || 1;
  const mesasDisponibles = mesas.filter(x => x.id !== m.id && x.estado === 'libre');
  const c = ESTADO_COLOR[m.estado] || ESTADO_COLOR.ocupada;

  panelEl.innerHTML = `
    <div class="pos-mesa-detail">
      <div class="pos-mesa-header" style="background:${c.bg}">
        <button style="width:32px;height:32px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;margin-right:10px"
          onclick="posVolverComanda('${m.id}')"><i class="ti ti-arrow-left"></i></button>
        <div>
          <div style="font-size:15px;font-weight:700">Editar venta — Mesa ${m.numero}</div>
        </div>
      </div>

      <div style="padding:20px;display:flex;flex-direction:column;gap:20px">
        <!-- Personas -->
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--pos-muted);margin-bottom:10px">Personas</div>
          <div style="display:flex;align-items:center;gap:12px">
            <button class="pos-qty-btn" onclick="posChangePersonas('${m.id}',-1)"><i class="ti ti-minus"></i></button>
            <span id="pos-personas-val" class="pos-qty-val" style="font-size:28px;font-weight:700;min-width:40px;text-align:center">${personas}</span>
            <button class="pos-qty-btn" onclick="posChangePersonas('${m.id}',1)"><i class="ti ti-plus"></i></button>
          </div>
        </div>

        <!-- Mover mesa -->
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--pos-muted);margin-bottom:10px">Mover venta a otra mesa</div>
          ${mesasDisponibles.length ? `
            <select id="mover-mesa-select" style="width:100%;padding:9px 11px;border-radius:8px;border:1px solid var(--pos-border);background:var(--pos-bg);color:var(--pos-text);font-family:inherit;font-size:13px;outline:none">
              <option value="">— Selecciona mesa destino —</option>
              ${mesasDisponibles.map(x => `<option value="${x.id}">Mesa ${x.numero} (libre)</option>`).join('')}
            </select>
            <button class="pos-action-btn primary" style="margin-top:10px" onclick="posMoverMesa('${m.id}', document.getElementById('mover-mesa-select').value)">
              <i class="ti ti-arrows-exchange"></i> Mover a esta mesa
            </button>` : `
            <div style="font-size:13px;color:var(--pos-muted);padding:12px;background:rgba(255,255,255,.04);border-radius:8px;text-align:center">
              No hay mesas libres disponibles
            </div>`}
        </div>
      </div>

      <div style="padding:12px;border-top:1px solid var(--pos-border);margin-top:auto">
        <button class="pos-action-btn" onclick="posVolverComanda('${m.id}')">
          <i class="ti ti-arrow-left"></i> Volver a comanda
        </button>
      </div>
    </div>`;
}

// ── Comanda: búsqueda de productos ───────────────────────────────
export function filtrarProductos(mesaId, val) {
  const drop = document.getElementById(`cmd-drop-${mesaId}`);
  if (!drop) return;
  const f = val.toLowerCase().trim();
  const lista = f ? _productos.filter(p => p.nombre.toLowerCase().includes(f)).slice(0, 25) : _productos.slice(0, 25);
  if (!lista.length) { drop.style.display='none'; return; }
  drop.innerHTML = lista.map(p => `
    <div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between;align-items:center;font-size:13px"
      onmousedown="posAgregarAComanda('${mesaId}','${p.id}')">
      <div>
        <div style="font-weight:500">${p.nombre}</div>
        <div style="font-size:11px;color:var(--pos-muted)">${p.categorias_productos?.nombre||''}</div>
      </div>
      <div style="font-weight:600;color:var(--pos-accent);margin-left:12px">${_fmtPesos(p.precio)}</div>
    </div>`).join('');
  drop.style.display='block';
}

// ── Comanda: agregar producto (va a pending) ─────────────────────
export async function agregarAComanda(mesaId, productoId) {
  const prod = _productos.find(p => p.id === productoId);
  if (!prod) return;
  const grupos = await _loadGruposForProducto(productoId);
  if (!_pendingItems[mesaId]) _pendingItems[mesaId] = [];
  _pendingItems[mesaId].push({
    localId: ++_localId,
    id: productoId,
    nombre: prod.nombre,
    precio: prod.precio || 0,
    cantidad: 1,
    grupos: grupos.map(g => ({ grupo_id: g.id, nombre: g.nombre, min: g.min, max: g.max,
      opcion_id: null, opcion_nombre: null, precio_adicional: 0, opciones: g.opciones })),
    comentario: '',
    showComment: false,
    _cocina: prod.categorias_productos?.cocinas || null,
  });
  const inp = document.getElementById(`cmd-search-${mesaId}`);
  if (inp) inp.value='';
  const drop = document.getElementById(`cmd-drop-${mesaId}`);
  if (drop) drop.style.display='none';
  _updateComandaUI(mesaId);
}

// ── Comanda: confirmar pedidos → enviar a cocina ─────────────────
export async function confirmarPedidos(mesaId) {
  const pending = _pendingItems[mesaId] || [];
  if (!pending.length) return;

  const mesa    = mesas.find(m => m.id === mesaId);
  const zona    = zonas.find(z => z.id === mesa?.zona_id);
  const personas = _mesaPersonas[mesaId] || 1;

  // Agrupar por cocina
  const byCocina = {};
  for (const item of pending) {
    const cocina   = item._cocina;
    const cKey     = cocina?.id || '__sin__';
    const cNombre  = cocina?.nombre || 'General';
    if (!byCocina[cKey]) byCocina[cKey] = { cocinaId: cocina?.id || null, cocinaNombre: cNombre, items: [] };
    byCocina[cKey].items.push(item);
  }

  for (const [, group] of Object.entries(byCocina)) {
    const { data: comanda, error } = await supabase.from('pos_comandas').insert({
      mesa_id:      mesaId,
      mesa_numero:  mesa?.numero || '',
      zona_nombre:  zona?.nombre || '',
      cocina_id:    group.cocinaId,
      cocina_nombre: group.cocinaNombre,
      estado:       'pendiente',
      personas,
    }).select().single();

    if (!error && comanda) {
      await supabase.from('pos_comanda_items').insert(
        group.items.flatMap(item => Array.from({ length: item.cantidad }, () => ({
          comanda_id:   comanda.id,
          producto_id:  item.id,
          nombre:       item.nombre,
          precio:       _precioItem(item),
          cantidad:     1,
          comentario:   item.comentario || null,
          modificadores: item.grupos.filter(g => g.opcion_id)
            .map(g => ({ grupo: g.nombre, opcion: g.opcion_nombre, precio_adicional: g.precio_adicional })),
        })))
      );
    }
  }

  // Mover a confirmed
  if (!_confirmedItems[mesaId]) _confirmedItems[mesaId] = [];
  for (const item of pending) {
    _confirmedItems[mesaId].push({ ...item, localId: ++_localId });
  }
  _pendingItems[mesaId] = [];
  showPosToast('Pedido enviado a cocina ✓');
  _updateComandaUI(mesaId);
}

export function cancelarPendientes(mesaId) {
  _pendingItems[mesaId] = [];
  _updateComandaUI(mesaId);
}

// ── Comanda: operaciones sobre ítems ────────────────────────────
export function eliminarPendiente(mesaId, idx) {
  (_pendingItems[mesaId]||[]).splice(idx, 1);
  _updateComandaUI(mesaId);
}
export function eliminarConfirmado(mesaId, idx) {
  (_confirmedItems[mesaId]||[]).splice(idx, 1);
  _updateComandaUI(mesaId);
}
export function changePendingQty(mesaId, idx, delta) {
  const items = _pendingItems[mesaId];
  if (!items?.[idx]) return;
  items[idx].cantidad = Math.max(1, items[idx].cantidad + delta);
  _updateComandaUI(mesaId);
}
export function changeConfirmedQty(mesaId, idx, delta) {
  const items = _confirmedItems[mesaId];
  if (!items?.[idx]) return;
  items[idx].cantidad += delta;
  if (items[idx].cantidad <= 0) items.splice(idx, 1);
  _updateComandaUI(mesaId);
}
export function toggleCommentP(mesaId, idx) {
  const item = (_pendingItems[mesaId]||[])[idx];
  if (item) { item.showComment = !item.showComment; _updateComandaUI(mesaId); }
}
export function toggleCommentC(mesaId, idx) {
  const item = (_confirmedItems[mesaId]||[])[idx];
  if (item) { item.showComment = !item.showComment; _updateComandaUI(mesaId); }
}
export function setCommentP(mesaId, idx, val) {
  const item = (_pendingItems[mesaId]||[])[idx];
  if (item) item.comentario = val;
}
export function setCommentC(mesaId, idx, val) {
  const item = (_confirmedItems[mesaId]||[])[idx];
  if (item) item.comentario = val;
}
export function setGrupoOpcion(mesaId, pendingIdx, grupoIdx, opcionId, opcionText) {
  const item = (_pendingItems[mesaId]||[])[pendingIdx];
  if (!item?.grupos?.[grupoIdx]) return;
  const g = item.grupos[grupoIdx];
  const opc = g.opciones.find(o => o.id === opcionId);
  g.opcion_id      = opcionId  || null;
  g.opcion_nombre  = opcionId  ? (opc?.nombre || opcionText.replace(/\s*\(\+.*\)$/,'')) : null;
  g.precio_adicional = opc?.precio_adicional || 0;
}

// ── Descuento helpers ────────────────────────────────────────────
export function toglDesc(mesaId) {
  _showDescuento[mesaId] = !_showDescuento[mesaId];
  renderRightPanel(document.getElementById('pos-right-panel'));
}
export function setDescTipo(mesaId, tipo) {
  if (!_descuentos[mesaId]) _descuentos[mesaId] = { tipo, valor: 0 };
  else _descuentos[mesaId].tipo = tipo;
}
export function aplicarDescuento(mesaId) {
  const inp = document.getElementById(`desc-val-${mesaId}`);
  const val = parseFloat(inp?.value) || 0;
  const tipo = document.querySelector(`input[name="desc-tipo-${mesaId}"]:checked`)?.value || '%';
  _descuentos[mesaId] = { tipo, valor: val };
  renderRightPanel(document.getElementById('pos-right-panel'));
}

// ── Cerrar mesa → modal de checkout ──────────────────────────────
export async function cerrarMesa(mesaId) {
  await _syncConfirmedFromDB(mesaId);
  const confirmed = _confirmedItems[mesaId] || [];
  const pending   = _pendingItems[mesaId]   || [];
  const mesa      = mesas.find(m => m.id === mesaId);

  if (!confirmed.length && !pending.length) {
    let warnEl = document.getElementById('modal-cerrar-mesa');
    if (!warnEl) {
      warnEl = document.createElement('div');
      warnEl.id = 'modal-cerrar-mesa';
      warnEl.className = 'pos-modal-backdrop';
      document.body.appendChild(warnEl);
      warnEl.addEventListener('click', e => { if(e.target===warnEl) warnEl.classList.remove('open'); });
    }
    warnEl.innerHTML = `
      <div class="pos-modal">
        <div class="pos-modal-title">CERRAR MESA ${mesa?.numero||''}</div>
        <div style="color:#f87171;font-style:italic;font-size:13px">La mesa no contiene adiciones.</div>
        <div class="pos-modal-footer">
          <button class="pos-modal-btn" onclick="document.getElementById('modal-cerrar-mesa').classList.remove('open')">Cancelar</button>
          <button class="pos-modal-btn primary" onclick="posConfirmarCierre('${mesaId}')">Cerrar igual</button>
        </div>
      </div>`;
    warnEl.classList.add('open');
    return;
  }

  // Init checkout state
  const desc = _descuentos[mesaId];
  const subtotal = confirmed.reduce((s,i) => s + _precioItem(i)*i.cantidad, 0);
  const descMonto = desc?.valor ? (desc.tipo==='%' ? Math.round(subtotal*desc.valor/100) : Math.min(desc.valor,subtotal)) : 0;
  const totalSinPropina = subtotal - descMonto;
  const propinaSugerida = Math.round(totalSinPropina * 0.10);

  _co = {
    mesaId,
    propinas: [{ metodo: 'Efectivo', monto: propinaSugerida }],
    pagos: [{ metodo: 'Efectivo', monto: totalSinPropina + propinaSugerida }],
    parcial: false,
  };
  _coIdx = 0;
  _renderCheckoutModal(mesaId);
}

function _renderCheckoutModal(mesaId) {
  let el = document.getElementById('modal-checkout');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modal-checkout';
    el.className = 'pos-modal-backdrop';
    el.style.cssText = 'z-index:3000';
    document.body.appendChild(el);
  }
  const mesa     = mesas.find(m => m.id === mesaId);
  const confirmed = _confirmedItems[mesaId] || [];
  const desc = _descuentos[mesaId];
  const subtotal  = confirmed.reduce((s,i) => s + _precioItem(i)*i.cantidad, 0);
  const descMonto = desc?.valor ? (desc.tipo==='%' ? Math.round(subtotal*desc.valor/100) : Math.min(desc.valor,subtotal)) : 0;
  const totalBase = subtotal - descMonto;
  const propinaMonto = (_co.propinas||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const total     = totalBase + propinaMonto;
  const pagado    = (_co.pagos||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const vuelto    = pagado - total;

  const metodosHtml = CO_METODOS.map(m=>`<option value="${m}">${m}</option>`).join('');

  const propinasHtml = (_co.propinas||[]).map((p,i)=>`
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <select onchange="posCoSetPropina(${i},'metodo',this.value)"
        style="flex:1;padding:5px;border-radius:6px;border:1px solid var(--pos-border);background:rgba(0,0,0,.4);color:var(--pos-text);font-size:13px">
        ${CO_METODOS.map(m=>`<option value="${m}" ${p.metodo===m?'selected':''}>${m}</option>`).join('')}
      </select>
      <input type="number" min="0" value="${p.monto}" onchange="posCoSetPropina(${i},'monto',this.value)"
        style="width:90px;padding:5px;border-radius:6px;border:1px solid var(--pos-border);background:rgba(0,0,0,.4);color:var(--pos-text);font-size:13px">
      <button onclick="posCoRemovePropina(${i})" style="background:none;border:none;color:#f87;cursor:pointer;font-size:16px;line-height:1">×</button>
    </div>`).join('');

  const pagosHtml = (_co.pagos||[]).map((p,i)=>`
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <select onchange="posCoSetPago(${i},'metodo',this.value)"
        style="flex:1;padding:5px;border-radius:6px;border:1px solid var(--pos-border);background:rgba(0,0,0,.4);color:var(--pos-text);font-size:13px">
        ${CO_METODOS.map(m=>`<option value="${m}" ${p.metodo===m?'selected':''}>${m}</option>`).join('')}
      </select>
      <input type="number" min="0" value="${p.monto}" onchange="posCoSetPago(${i},'monto',this.value)"
        style="width:90px;padding:5px;border-radius:6px;border:1px solid var(--pos-border);background:rgba(0,0,0,.4);color:var(--pos-text);font-size:13px">
      <button onclick="posCoRemovePago(${i})" style="background:none;border:none;color:#f87;cursor:pointer;font-size:16px;line-height:1">×</button>
    </div>`).join('');

  const adicionesHtml = confirmed.map(i=>`
    <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)">
      <span>${i.cantidad}x ${i.nombre}</span>
      <span>${_fmtPesos(_precioItem(i)*i.cantidad)}</span>
    </div>`).join('');

  el.innerHTML = `
    <div class="pos-modal" style="width:min(800px,96vw);max-height:90vh;overflow-y:auto;padding:0">
      <div style="padding:16px 20px;border-bottom:1px solid var(--pos-border);display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:16px">COBRO — MESA ${mesa?.numero||''}</div>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" ${_co.parcial?'checked':''} onchange="_coParcialChange(this.checked)"> Cierre parcial
        </label>
      </div>
      <div style="display:flex;gap:0;min-height:360px">
        <!-- LEFT: resumen -->
        <div style="flex:1;padding:16px 20px;border-right:1px solid var(--pos-border)">
          <div style="font-size:11px;font-weight:600;color:var(--pos-muted);letter-spacing:.08em;margin-bottom:8px">ADICIONES</div>
          ${adicionesHtml}
          <div style="margin-top:12px;font-size:13px;display:flex;justify-content:space-between;padding:4px 0">
            <span>Subtotal</span><span>${_fmtPesos(subtotal)}</span>
          </div>
          ${descMonto>0?`<div style="font-size:13px;display:flex;justify-content:space-between;padding:4px 0;color:#f87">
            <span>Descuento</span><span>-${_fmtPesos(descMonto)}</span>
          </div>`:''}
          <div style="font-size:13px;display:flex;justify-content:space-between;padding:4px 0">
            <span>Propina</span><span>${_fmtPesos(propinaMonto)}</span>
          </div>
          <div style="font-size:18px;font-weight:700;display:flex;justify-content:space-between;padding:10px 0 0;border-top:2px solid var(--pos-border);margin-top:6px">
            <span>TOTAL</span><span>${_fmtPesos(total)}</span>
          </div>
        </div>
        <!-- RIGHT: propina + pago -->
        <div style="flex:1;padding:16px 20px;display:flex;flex-direction:column;gap:20px">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--pos-muted);letter-spacing:.08em;margin-bottom:8px">PROPINA</div>
            ${propinasHtml}
            <button onclick="posCoAddPropina()" style="font-size:12px;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,.08);border:1px solid var(--pos-border);color:var(--pos-text);cursor:pointer;margin-top:4px">
              + Agregar propina
            </button>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--pos-muted);letter-spacing:.08em;margin-bottom:8px">PAGO</div>
            ${pagosHtml}
            <button onclick="posCoAddPago()" style="font-size:12px;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,.08);border:1px solid var(--pos-border);color:var(--pos-text);cursor:pointer;margin-top:4px">
              + Agregar método de pago
            </button>
          </div>
          <div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--pos-border)">
            <div style="font-size:13px;display:flex;justify-content:space-between;margin-bottom:4px">
              <span>Pagado</span><span>${_fmtPesos(pagado)}</span>
            </div>
            <div style="font-size:15px;font-weight:700;display:flex;justify-content:space-between;color:${vuelto<0?'#f87171':'#4ade80'}">
              <span>Vuelto</span><span>${_fmtPesos(Math.abs(vuelto))} ${vuelto<0?'(falta)':''}</span>
            </div>
          </div>
        </div>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--pos-border);display:flex;justify-content:flex-end;gap:10px">
        <button class="pos-modal-btn" onclick="document.getElementById('modal-checkout').classList.remove('open')">Cancelar</button>
        <button class="pos-modal-btn primary" onclick="posEjecutarCierre('${mesaId}')">
          <i class="ti ti-door-exit"></i> Cerrar mesa ${mesa?.numero||''}
        </button>
      </div>
    </div>`;
  el.classList.add('open');
}

// Helpers checkout
function _coSyncPago() {
  // Mantiene el primer pago sincronizado con el total actual
  if (!_co?.pagos?.length) return;
  const confirmed = _confirmedItems[_co.mesaId] || [];
  const desc = _descuentos[_co.mesaId];
  const subtotal  = confirmed.reduce((s,i) => s + _precioItem(i)*i.cantidad, 0);
  const descMonto = desc?.valor ? (desc.tipo==='%' ? Math.round(subtotal*desc.valor/100) : Math.min(desc.valor,subtotal)) : 0;
  const propinaMonto = (_co.propinas||[]).reduce((s,p) => s + Number(p.monto||0), 0);
  _co.pagos[0].monto = subtotal - descMonto + propinaMonto;
}

export function coAddPropina() {
  if (!_co) return;
  _co.propinas.push({ metodo:'Efectivo', monto:0 });
  _coSyncPago();
  _renderCheckoutModal(_co.mesaId);
}
export function coRemovePropina(idx) {
  if (!_co) return;
  _co.propinas.splice(idx,1);
  _coSyncPago();
  _renderCheckoutModal(_co.mesaId);
}
export function coSetPropina(idx, field, val) {
  if (!_co) return;
  _co.propinas[idx][field] = field==='monto' ? Number(val)||0 : val;
  _coSyncPago();
  _renderCheckoutModal(_co.mesaId);
}
export function coAddPago() {
  if (!_co) return;
  _co.pagos.push({ metodo:'Efectivo', monto:0 });
  _renderCheckoutModal(_co.mesaId);
}
export function coRemovePago(idx) {
  if (!_co) return;
  _co.pagos.splice(idx,1);
  _renderCheckoutModal(_co.mesaId);
}
export function coSetPago(idx, field, val) {
  if (!_co) return;
  _co.pagos[idx][field] = field==='monto' ? Number(val)||0 : val;
  _renderCheckoutModal(_co.mesaId);
}

export async function ejecutarCierre(mesaId) {
  if (!_co) return;
  const confirmed = _confirmedItems[mesaId] || [];
  const desc = _descuentos[mesaId];
  const subtotal  = confirmed.reduce((s,i)=>s+_precioItem(i)*i.cantidad,0);
  const descMonto = desc?.valor ? (desc.tipo==='%' ? Math.round(subtotal*desc.valor/100) : Math.min(desc.valor,subtotal)) : 0;
  const propinaMonto = _co.propinas.reduce((s,p)=>s+Number(p.monto||0),0);
  const total = subtotal - descMonto + propinaMonto;
  const mesa  = mesas.find(m=>m.id===mesaId);

  const { data: venta, error: eVenta } = await supabase.from('pos_ventas').insert({
    mesa_id: mesaId,
    mesa_numero: mesa?.numero?.toString()||'',
    zona_nombre: zonas.find(z=>z.id===mesa?.zona_id)?.nombre||'',
    estado: 'cerrado',
    personas: _mesaPersonas[mesaId]||1,
    subtotal,
    descuento_tipo: desc?.tipo||null,
    descuento_valor: desc?.valor||0,
    descuento_monto: descMonto,
    propina: propinaMonto,
    total,
    hora_inicio: _mesaHora[mesaId]?.toISOString()||new Date().toISOString(),
    hora_cierre: new Date().toISOString(),
  }).select('id').single();

  if (eVenta) { console.error('pos_ventas:', eVenta); showPosToast('Error guardando venta'); return; }

  const pagosRows = [
    ..._co.propinas.map(p=>({ venta_id:venta.id, metodo:p.metodo, monto:Number(p.monto)||0, tipo:'propina' })),
    ..._co.pagos.map(p=>({ venta_id:venta.id, metodo:p.metodo, monto:Number(p.monto)||0, tipo:'pago' })),
  ].filter(r=>r.monto>0);
  if (pagosRows.length) await supabase.from('pos_venta_pagos').insert(pagosRows);

  await supabase.from('pos_comandas')
    .update({ estado:'cerrado' })
    .eq('mesa_id', mesaId)
    .in('estado',['pendiente','preparando','listo']);

  document.getElementById('modal-checkout')?.classList.remove('open');
  _confirmedItems[mesaId] = [];
  _pendingItems[mesaId]   = [];
  delete _mesaHora[mesaId];
  delete _descuentos[mesaId];
  delete _showDescuento[mesaId];
  _co = null;
  await cambiarEstado(mesaId, 'libre');
  showPosToast('Mesa cerrada ✓');
}

export async function confirmarCierre(mesaId) {
  document.getElementById('modal-cerrar-mesa')?.classList.remove('open');
  await supabase.from('pos_comandas')
    .update({ estado: 'cerrado' })
    .eq('mesa_id', mesaId)
    .in('estado', ['pendiente', 'preparando', 'listo']);
  _confirmedItems[mesaId] = [];
  _pendingItems[mesaId]   = [];
  delete _mesaHora[mesaId];
  await cambiarEstado(mesaId, 'libre');
  showPosToast('Mesa cerrada ✓');
}

// ── Editar venta ─────────────────────────────────────────────────
export function editarVenta(mesaId) {
  _editingMesaId = mesaId;
  renderRightPanel(document.getElementById('pos-right-panel'));
}
export function volverComanda(mesaId) {
  _editingMesaId = null;
  renderRightPanel(document.getElementById('pos-right-panel'));
}

export function moverMesa(desdeMesaId, hastaMesaId) {
  if (!hastaMesaId) { showPosToast('Selecciona una mesa destino', 'error'); return; }
  const hasta = mesas.find(m => m.id === hastaMesaId);
  if (!hasta || hasta.estado !== 'libre') { showPosToast('La mesa destino no está libre', 'error'); return; }

  // Mover datos
  _confirmedItems[hastaMesaId] = [...(_confirmedItems[desdeMesaId]||[])];
  _pendingItems[hastaMesaId]   = [...(_pendingItems[desdeMesaId]||[])];
  _mesaPersonas[hastaMesaId]   = _mesaPersonas[desdeMesaId] || 1;
  _mesaHora[hastaMesaId]       = _mesaHora[desdeMesaId];

  _confirmedItems[desdeMesaId] = [];
  _pendingItems[desdeMesaId]   = [];
  delete _mesaHora[desdeMesaId];

  // Cambiar estados en DB
  supabase.from('mesas').update({ estado: 'ocupada' }).eq('id', hastaMesaId).then(() => {});
  supabase.from('mesas').update({ estado: 'libre'   }).eq('id', desdeMesaId).then(() => {});

  const mDesde = mesas.find(m => m.id === desdeMesaId);
  const mHasta = mesas.find(m => m.id === hastaMesaId);
  if (mDesde) mDesde.estado = 'libre';
  if (mHasta) mHasta.estado = 'ocupada';

  mesaSelected = mHasta || null;
  _editingMesaId = null;

  renderPlano(document.getElementById('pos-plano'));
  renderRightPanel(document.getElementById('pos-right-panel'));
  showPosToast(`Venta movida a Mesa ${mHasta?.numero||''} ✓`);
}

// ── Pre-cuenta (modal simple) ────────────────────────────────────
export function verPreCuenta(mesaId) {
  const mesa      = mesas.find(m => m.id === mesaId);
  const confirmed = _confirmedItems[mesaId] || [];
  const pending   = _pendingItems[mesaId]   || [];
  const all       = [...confirmed, ...pending];
  const total     = all.reduce((s,i) => s + _precioItem(i)*i.cantidad, 0);
  const personas  = _mesaPersonas[mesaId] || 1;

  let el = document.getElementById('modal-precuenta');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modal-precuenta';
    el.className = 'pos-modal-backdrop';
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target===el) el.classList.remove('open'); });
  }
  el.innerHTML = `
    <div class="pos-modal" style="width:380px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="pos-modal-title">Pre-cuenta — Mesa ${mesa?.numero||''}</div>
        <button onclick="document.getElementById('modal-precuenta').classList.remove('open')" style="border:none;background:none;color:var(--pos-muted);cursor:pointer;font-size:18px">×</button>
      </div>
      <div style="font-size:12px;color:var(--pos-muted);margin-bottom:12px">${personas} persona${personas!==1?'s':''}</div>
      <div style="border-top:1px solid var(--pos-border)">
        ${all.map(i => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
            <div>${i.cantidad > 1 ? i.cantidad+'× ':''}<span style="font-weight:500">${i.nombre}</span></div>
            <div style="font-weight:600">${_fmtPesos(_precioItem(i)*i.cantidad)}</div>
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:16px;font-weight:700;border-top:2px solid var(--pos-border);margin-top:4px">
          <div>Total</div>
          <div>${_fmtPesos(total)}</div>
        </div>
      </div>
    </div>`;
  el.classList.add('open');
}

// ── Update UI comanda ────────────────────────────────────────────
function _updateComandaUI(mesaId) {
  const panel = document.getElementById('pos-right-panel');
  if (mesaSelected?.id === mesaId && panel) {
    renderRightPanel(panel);
  }
  renderPlano(document.getElementById('pos-plano'));
}

// ── Estado de mesa ───────────────────────────────────────────────
export async function cambiarEstado(id, nuevoEstado) {
  const { error } = await supabase.from('mesas').update({ estado: nuevoEstado }).eq('id', id);
  if (error) { showPosToast('Error al actualizar estado', 'error'); return; }
  const m = mesas.find(x => x.id === id);
  if (m) m.estado = nuevoEstado;
  if (mesaSelected?.id === id) mesaSelected.estado = nuevoEstado;
  if (nuevoEstado === 'ocupada' && !_mesaHora[id]) _mesaHora[id] = new Date();
  renderPlano(document.getElementById('pos-plano'));
  renderRightPanel(document.getElementById('pos-right-panel'));
}

export async function abrirMesa(id) {
  if (!_mesaHora[id]) _mesaHora[id] = new Date();
  await cambiarEstado(id, 'ocupada');
}

// ── Personas / Garzón / Casa ─────────────────────────────────────
export function changePersonas(mesaId, delta) {
  const next = Math.max(1, Math.min((_mesaPersonas[mesaId]||1) + delta, 20));
  _mesaPersonas[mesaId] = next;
  const el = document.getElementById('pos-personas-val');
  if (el) el.textContent = next;
  renderPlano(document.getElementById('pos-plano'));
}
export function setGarzon(mesaId, nombre) { _mesaGarzon[mesaId] = nombre; }
export function toggleCasa(mesaId, casaId) {
  _mesaCasa[mesaId] = _mesaCasa[mesaId]===casaId ? null : casaId;
  renderRightPanel(document.getElementById('pos-right-panel'));
  renderPlano(document.getElementById('pos-plano'));
}

// ── Agregar mesa / zona ──────────────────────────────────────────
export async function addMesa(numero, capacidad, forma) {
  if (!zonaActual) { showPosToast('Selecciona una zona primero', 'error'); return; }
  if (!numero.trim()) { showPosToast('El número de mesa es obligatorio', 'error'); return; }
  const { data, error } = await supabase.from('mesas').insert({
    numero: numero.trim(), zona_id: zonaActual.id,
    capacidad: Number(capacidad)||4, forma: forma||'cuadrado',
    pos_x: 50+(mesas.length%8)*100, pos_y: 50+Math.floor(mesas.length/8)*120,
    estado: 'libre', activa: true,
  }).select().single();
  if (error) { showPosToast('Error: '+error.message, 'error'); return; }
  mesas.push(data);
  renderPlano(document.getElementById('pos-plano'));
  showPosToast('Mesa agregada ✓');
}

export async function eliminarMesa(id) {
  if (!confirm('¿Eliminar esta mesa?')) return;
  await supabase.from('mesas').update({ activa: false }).eq('id', id);
  mesas = mesas.filter(m => m.id !== id);
  if (mesaSelected?.id === id) mesaSelected = null;
  renderPlano(document.getElementById('pos-plano'));
  renderRightPanel(document.getElementById('pos-right-panel'));
  showPosToast('Mesa eliminada');
}

export function toggleEditMode(btnEl) {
  editMode = !editMode;
  btnEl.innerHTML = editMode
    ? '<i class="ti ti-check"></i> Guardar posiciones'
    : '<i class="ti ti-pencil"></i> Editar plano';
  btnEl.style.background = editMode ? '#22c55e' : '';
  btnEl.style.color = editMode ? '#fff' : '';
  document.getElementById('pos-add-mesa-btn').style.display = editMode ? 'flex' : 'none';
  renderPlano(document.getElementById('pos-plano'));
  renderRightPanel(document.getElementById('pos-right-panel'));
}

export async function addZona(nombre) {
  if (!nombre.trim()) return;
  const { data, error } = await supabase.from('zonas').insert({
    nombre: nombre.trim(), orden: zonas.length+1,
  }).select().single();
  if (error) { showPosToast('Error al agregar zona', 'error'); return; }
  zonas.push(data);
  showPosToast('Zona agregada ✓');
  return data;
}

// ── Monitor de cocina ────────────────────────────────────────────
export async function loadMonitor() {
  const { data } = await supabase
    .from('pos_comandas')
    .select('*, pos_comanda_items(*)')
    .in('estado', ['pendiente', 'preparando'])
    .order('hora_inicio');
  return data || [];
}

export async function prepararComanda(comandaId) {
  await supabase.from('pos_comandas').update({ estado: 'preparando', hora_preparando: new Date().toISOString() }).eq('id', comandaId);
  refreshMonitor();
}

export async function terminarComanda(comandaId) {
  await supabase.from('pos_comandas').update({ estado: 'listo', hora_listo: new Date().toISOString() }).eq('id', comandaId);
  refreshMonitor();
}

export async function prepararItem(itemId, comandaId) {
  await supabase.from('pos_comanda_items').update({ estado: 'preparando' }).eq('id', itemId);
  // Si la comanda estaba pendiente, pasarla a preparando
  await supabase.from('pos_comandas')
    .update({ estado: 'preparando', hora_preparando: new Date().toISOString() })
    .eq('id', comandaId).eq('estado', 'pendiente');
  refreshMonitor();
}

export async function terminarItem(itemId, comandaId) {
  await supabase.from('pos_comanda_items').update({ estado: 'listo' }).eq('id', itemId);
  // Si todos los ítems están listos → cerrar comanda
  const { data: items } = await supabase
    .from('pos_comanda_items').select('estado').eq('comanda_id', comandaId);
  if (items?.every(i => i.estado === 'listo')) {
    await supabase.from('pos_comandas')
      .update({ estado: 'listo', hora_listo: new Date().toISOString() }).eq('id', comandaId);
  }
  refreshMonitor();
}

export async function refreshMonitor() {
  const monitorEl = document.getElementById('monitor-content');
  if (!monitorEl) return;
  const comandas = await loadMonitor();
  renderMonitorCards(monitorEl, comandas);
}

export function renderMonitorCards(containerEl, comandas) {
  if (!comandas.length) {
    containerEl.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#9ca3af;width:100%">
      <i class="ti ti-chef-hat" style="font-size:56px"></i>
      <div style="font-size:17px;font-weight:600">Sin comandas pendientes</div>
    </div>`;
    return;
  }

  containerEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:20px;padding:24px;align-content:flex-start;width:100%">` +
    comandas.map(cmd => {
      const inicio = new Date(cmd.hora_inicio);
      const horaStr = inicio.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',hour12:false});
      const isPendiente  = cmd.estado === 'pendiente';
      const isPreparando = cmd.estado === 'preparando';
      const items = cmd.pos_comanda_items || [];

      // Timer inicial (se actualiza en tiempo real via data-ref)
      const refISO  = isPreparando ? cmd.hora_preparando : cmd.hora_inicio;
      const refTime = new Date(refISO);
      const diffMs  = Date.now() - refTime.getTime();
      const mm0 = Math.floor(diffMs/60000).toString().padStart(2,'0');
      const ss0 = Math.floor((diffMs%60000)/1000).toString().padStart(2,'0');

      return `<div style="background:#fff;border-radius:14px;padding:20px;min-width:320px;max-width:380px;flex:1;
          box-shadow:0 4px 14px rgba(0,0,0,.1);border:1px solid #e5e7eb;font-family:'DM Sans',sans-serif;display:flex;flex-direction:column;gap:0">

        <!-- Cabecera -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:18px;font-weight:800;color:#111">#${cmd.numero}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">${cmd.zona_nombre||''}</div>
          </div>
          <div class="monitor-timer" data-ref="${refISO}"
            style="background:${isPreparando?'#fef3c7':'#fee2e2'};color:${isPreparando?'#92400e':'#991b1b'};
              padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums">
            ${mm0}:${ss0}
          </div>
        </div>

        <!-- Info -->
        <div style="display:flex;gap:10px;margin-bottom:14px;font-size:12px;color:#6b7280;flex-wrap:wrap">
          <span>⏱ ${horaStr}</span>
          <span>· Mesa ${cmd.mesa_numero||''}</span>
          <span>· ${cmd.personas} persona${cmd.personas!==1?'s':''}</span>
        </div>

        <!-- Ítems con botón por ítem -->
        <div style="background:#f9fafb;border-radius:10px;overflow:hidden;margin-bottom:14px;font-size:16px;color:#111;border:1px solid #f3f4f6">
          ${items.map(i => {
            const mods = Array.isArray(i.modificadores) ? i.modificadores : [];
            const iEst = i.estado || 'pendiente';
            const iDone = iEst === 'listo';
            const iPrep = iEst === 'preparando';
            const btnBg  = iDone ? '#22c55e' : iPrep ? '#f97316' : '#6b7280';
            const btnTxt = iDone ? 'Listo ✓' : iPrep ? 'Terminar' : 'Preparar';
            const btnFn  = iDone ? '' : iPrep
              ? `posMonitorTerminarItem('${i.id}','${cmd.id}')`
              : `posMonitorPrepararItem('${i.id}','${cmd.id}')`;
            return `<div style="padding:8px 12px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;gap:10px">
              <div style="flex:1;min-width:0">
                <div style="${iDone?'text-decoration:line-through;color:#9ca3af':''};font-weight:600">
                  ${i.cantidad > 1 ? `<span style="color:#6b7280">${i.cantidad}×</span> ` : ''}${i.nombre}
                </div>
                ${mods.map(m => `<div style="padding-left:8px;font-size:13px;color:#6b7280">· ${m.opcion||m.nombre||''}</div>`).join('')}
                ${i.comentario ? `<div style="padding-left:8px;font-size:13px;color:#9ca3af;font-style:italic">💬 ${i.comentario}</div>` : ''}
              </div>
              <button onclick="${btnFn}"
                style="flex-shrink:0;padding:5px 12px;border-radius:6px;border:none;background:${btnBg};color:#fff;
                  font-size:13px;font-weight:700;cursor:${iDone?'default':'pointer'};font-family:inherit;white-space:nowrap">
                ${btnTxt}
              </button>
            </div>`;
          }).join('')}
        </div>

        <!-- Cocina label -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em">${cmd.cocina_nombre}</div>
          <div style="font-size:11px;color:${isPendiente?'#9ca3af':'#d97706'};font-weight:500">${isPendiente?'Pendiente':'Preparando…'}</div>
        </div>

        <!-- Botones globales comanda -->
        <div style="display:flex;gap:8px">
          <button onclick="posMonitorPreparar('${cmd.id}')"
            style="flex:1;padding:11px;border-radius:8px;border:none;background:${isPendiente?'#ef4444':'#f3f4f6'};
              color:${isPendiente?'#fff':'#9ca3af'};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">
            Preparar todo
          </button>
          <button onclick="posMonitorTerminar('${cmd.id}')"
            style="flex:1;padding:11px;border-radius:8px;border:none;background:${isPreparando?'#22c55e':'#f3f4f6'};
              color:${isPreparando?'#fff':'#9ca3af'};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">
            Terminar todo
          </button>
        </div>
      </div>`;
    }).join('') + `</div>`;
}

// ── Toast ────────────────────────────────────────────────────────
let _toastTimer = null;
function showPosToast(msg, type) {
  const el = document.getElementById('pos-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'pos-toast visible' + (type==='error'?' error':'');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), type==='error'?5000:2500);
}

export function getZonas() { return zonas; }
export function getMesas() { return mesas; }
export function isEditMode() { return editMode; }
