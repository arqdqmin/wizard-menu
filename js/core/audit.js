import { supabase } from './supabase.js';
import { getSession } from './auth.js';

/**
 * Registra una acción en audit_logs.
 *
 * @param {Object} opts
 * @param {string}  opts.module       - Slug del módulo (ej: 'menu')
 * @param {string}  opts.action       - Descripción de la acción (ej: 'precio_actualizado')
 * @param {string}  [opts.recordId]   - ID del registro afectado
 * @param {string}  [opts.recordLabel]- Nombre legible del registro
 * @param {Object}  [opts.oldValues]  - Valores anteriores
 * @param {Object}  [opts.newValues]  - Valores nuevos
 */
export async function logAction({ module, action, recordId, recordLabel, oldValues, newValues }) {
  try {
    const session = await getSession();
    if (!session) return;

    const entry = {
      user_id:      session.user.id,
      user_name:    session.user.email,
      module,
      action,
      record_id:    recordId    ?? null,
      record_label: recordLabel ?? null,
      old_values:   oldValues   ?? null,
      new_values:   newValues   ?? null,
      user_agent:   navigator.userAgent,
    };

    // Fire-and-forget: no bloquear el flujo principal
    supabase.from('audit_logs').insert(entry).then(({ error }) => {
      if (error) console.warn('[audit] error al registrar:', error.message);
    });
  } catch (err) {
    console.warn('[audit] error inesperado:', err);
  }
}

/**
 * Helpers de acciones comunes para el módulo Menú
 */
export const auditMenu = {
  productoCreado:     (id, nombre) =>
    logAction({ module: 'menu', action: 'producto_creado',     recordId: String(id), recordLabel: nombre }),
  productoEditado:    (id, nombre, oldV, newV) =>
    logAction({ module: 'menu', action: 'producto_editado',    recordId: String(id), recordLabel: nombre, oldValues: oldV, newValues: newV }),
  productoEliminado:  (id, nombre) =>
    logAction({ module: 'menu', action: 'producto_eliminado',  recordId: String(id), recordLabel: nombre }),
  stockCambiado:      (id, nombre, stock) =>
    logAction({ module: 'menu', action: 'stock_cambiado',      recordId: String(id), recordLabel: nombre, newValues: { stock } }),
  categoriaCreada:    (id, nombre) =>
    logAction({ module: 'menu', action: 'categoria_creada',    recordId: String(id), recordLabel: nombre }),
  categoriaEliminada: (id, nombre) =>
    logAction({ module: 'menu', action: 'categoria_eliminada', recordId: String(id), recordLabel: nombre }),
  bannerCreado:       (id) =>
    logAction({ module: 'menu', action: 'banner_creado',       recordId: String(id) }),
  bannerEliminado:    (id) =>
    logAction({ module: 'menu', action: 'banner_eliminado',    recordId: String(id) }),
};

export const auditUsers = {
  usuarioCreado:   (id, email) =>
    logAction({ module: 'usuarios', action: 'usuario_creado',   recordId: id, recordLabel: email }),
  usuarioEditado:  (id, email, oldV, newV) =>
    logAction({ module: 'usuarios', action: 'usuario_editado',  recordId: id, recordLabel: email, oldValues: oldV, newValues: newV }),
  rolAsignado:     (userId, email, role) =>
    logAction({ module: 'usuarios', action: 'rol_asignado',     recordId: userId, recordLabel: email, newValues: { role } }),
  rolRemovido:     (userId, email, role) =>
    logAction({ module: 'usuarios', action: 'rol_removido',     recordId: userId, recordLabel: email, newValues: { role } }),
};

export const auditConfig = {
  moduloHabilitado:  (slug) =>
    logAction({ module: 'configuracion', action: 'modulo_habilitado',  recordLabel: slug }),
  moduloDeshabilitado: (slug) =>
    logAction({ module: 'configuracion', action: 'modulo_deshabilitado', recordLabel: slug }),
  permisoActualizado:  (role, module, perms) =>
    logAction({ module: 'configuracion', action: 'permiso_actualizado', recordLabel: `${role}→${module}`, newValues: perms }),
};
