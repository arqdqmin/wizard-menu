import { supabase } from './supabase.js';

const LOGIN_URL = '/platform/login.html';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Devuelve el access token activo o null */
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}

/**
 * Redirige a login si no hay sesión activa.
 * Devuelve el usuario si está autenticado.
 */
export async function requireAuth(redirectTo = LOGIN_URL) {
  const session = await getSession();
  if (!session) {
    const current = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `${redirectTo}?redirect=${current}`;
    return null;
  }
  // Actualizar last_access en background
  supabase
    .from('profiles')
    .update({ last_access: new Date().toISOString() })
    .eq('id', session.user.id)
    .then(() => {});
  return session.user;
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = LOGIN_URL;
}

/**
 * Envía email de recuperación de contraseña.
 * redirectTo debe ser la URL donde el usuario puede escribir la nueva contraseña.
 */
export async function resetPassword(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo ?? `${window.location.origin}/platform/login.html?mode=reset`,
  });
  if (error) throw error;
}

/** Actualiza la contraseña del usuario autenticado */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Escucha cambios en la sesión (útil para detectar logout en otra pestaña) */
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
