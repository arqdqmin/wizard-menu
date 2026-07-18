import { supabase } from '/js/core/supabase.js';

export const state = {
  productos:      [],
  categorias:     [],
  cocinas:        [],
  modificadores:  [],
  ingredientes:   [],
  preparaciones:  [],
  categoriaActual: null,
  mostrarInactivos: false,
};

export function fmtPesos(n) {
  const v = Number(n) || 0;
  return '$' + Math.round(v).toLocaleString('es-CL');
}

export function fmtPct(n) {
  return (Number(n) || 0).toFixed(1) + '%';
}

export function calcMargen(precio, costo) {
  if (!precio || precio === 0) return 0;
  return ((precio - costo) / precio) * 100;
}

export function calcMarkup(precio, costo) {
  if (!costo || costo === 0) return 0;
  return ((precio - costo) / costo) * 100;
}

// ── Toast ────────────────────────────────────────────────────────
let _toastTimer = null;
export function showToast(msg, type = 'ok') {
  const el = document.getElementById('carta-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'carta-toast visible' + (type === 'error' ? ' error' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), type === 'error' ? 5000 : 2500);
}

// ── Cargar datos base ────────────────────────────────────────────
export async function cargarCocinas() {
  const { data } = await supabase.from('cocinas').select('*').eq('activa', true).order('nombre');
  state.cocinas = data || [];
  return state.cocinas;
}

export async function cargarCategorias(soloActivas = false) {
  let q = supabase.from('categorias_productos').select('*, cocinas(nombre)').order('orden');
  if (soloActivas) q = q.eq('activa', true);
  const { data } = await q;
  state.categorias = data || [];
  return state.categorias;
}

export async function cargarIngredientes() {
  const { data } = await supabase
    .from('ingredientes')
    .select('id, nombre, categoria, unidad, costo, proveedor')
    .eq('activo', true)
    .order('nombre');
  state.ingredientes = data || [];
  return state.ingredientes;
}

export async function cargarReceta(productoId) {
  const { data } = await supabase
    .from('recetas')
    .select('*, ingredientes(id, nombre, unidad, costo), preparaciones(id, nombre, unidad, costo_por_unidad)')
    .eq('producto_id', productoId);
  return data || [];
}

export async function cargarPreparaciones() {
  const { data } = await supabase
    .from('preparaciones')
    .select('id, nombre, unidad, rendimiento, costo_por_unidad')
    .eq('activo', true)
    .order('nombre');
  state.preparaciones = data || [];
  return state.preparaciones;
}

export async function cargarModificadores() {
  const { data } = await supabase
    .from('grupos_modificadores')
    .select('*')
    .eq('activo', true)
    .order('nombre');
  state.modificadores = data || [];
  return state.modificadores;
}

export async function cargarProductos(categoriaId = null) {
  let q = supabase
    .from('productos')
    .select('*, categorias_productos(id, nombre, cocinas(nombre))')
    .order('nombre');
  if (categoriaId) q = q.eq('categoria_id', categoriaId);
  const { data } = await q;
  state.productos = data || [];
  return state.productos;
}
