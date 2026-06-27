import { supabase } from './supabase.js';

// Cache de sesión para evitar consultas repetidas
let _cache = null;
let _cacheUserId = null;

async function loadPermissions(userId) {
  if (_cache && _cacheUserId === userId) return _cache;

  const { data: userRoles, error } = await supabase
    .from('user_roles')
    .select(`
      role_id,
      roles (
        id,
        nombre,
        role_permissions (
          can_read,
          can_write,
          can_delete,
          modules ( id, nombre, slug, habilitado, icono, orden )
        )
      )
    `)
    .eq('user_id', userId);

  if (error) throw error;

  // Aplanar en estructura indexada por slug de módulo
  const permissions = {};
  const roleNames = [];
  let isSuperAdmin = false;

  for (const ur of userRoles ?? []) {
    const role = ur.roles;
    if (!role) continue;
    roleNames.push(role.nombre);
    if (role.nombre === 'super_admin') isSuperAdmin = true;

    for (const rp of role.role_permissions ?? []) {
      const mod = rp.modules;
      if (!mod) continue;
      const slug = mod.slug;
      if (!permissions[slug]) {
        permissions[slug] = {
          module: mod,
          can_read: false,
          can_write: false,
          can_delete: false,
        };
      }
      // Acumular permisos (cualquier rol que lo conceda cuenta)
      if (rp.can_read)   permissions[slug].can_read   = true;
      if (rp.can_write)  permissions[slug].can_write  = true;
      if (rp.can_delete) permissions[slug].can_delete = true;
    }
  }

  _cache = { permissions, roleNames, isSuperAdmin };
  _cacheUserId = userId;
  return _cache;
}

export function clearPermissionsCache() {
  _cache = null;
  _cacheUserId = null;
}

export async function getUserRoles(userId) {
  const { roleNames } = await loadPermissions(userId);
  return roleNames;
}

export async function isSuperAdmin(userId) {
  const { isSuperAdmin: sa } = await loadPermissions(userId);
  return sa;
}

/**
 * Verifica si el usuario tiene un permiso sobre un módulo.
 * @param {string} userId
 * @param {string} moduleSlug
 * @param {'read'|'write'|'delete'} action
 */
export async function hasPermission(userId, moduleSlug, action = 'read') {
  const { permissions, isSuperAdmin: sa } = await loadPermissions(userId);
  if (sa) return true;
  const perm = permissions[moduleSlug];
  if (!perm) return false;
  return perm[`can_${action}`] === true;
}

/**
 * Devuelve los módulos habilitados a los que el usuario tiene acceso (read).
 * Ordenados por `orden`.
 */
export async function getAccessibleModules(userId) {
  const { permissions, isSuperAdmin: sa } = await loadPermissions(userId);

  if (sa) {
    // Super admin ve todos los módulos habilitados
    const { data } = await supabase
      .from('modules')
      .select('*')
      .order('orden');
    return data ?? [];
  }

  return Object.values(permissions)
    .filter(p => p.can_read && p.module.habilitado)
    .map(p => p.module)
    .sort((a, b) => a.orden - b.orden);
}

/**
 * Devuelve todos los módulos (para pantalla de configuración).
 */
export async function getAllModules() {
  const { data, error } = await supabase
    .from('modules')
    .select('*')
    .order('orden');
  if (error) throw error;
  return data ?? [];
}
