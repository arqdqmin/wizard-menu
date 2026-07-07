import { supabase }             from '../core/supabase.js';
import { getSession, logout }   from '../core/auth.js';
import { getAccessibleModules } from '../core/permissions.js';

const MODULE_URLS = {
  dashboard:    '/platform/dashboard.html',
  menu:         '/admin.html',
  usuarios:     '/platform/users.html',
  talleres:     '/platform/talleres.html',
  marketing:    '/platform/marketing.html',
  configuracion:'/platform/settings.html',
  wcontrol:     '/platform/wcontrol/index.html',
  carta:        '/platform/carta/index.html',
};

export async function initShell(activeSlug, pageTitle) {
  const session = await getSession();
  if (!session) return;

  const user = session.user;
  const profileRes = await supabase
    .from('profiles')
    .select('nombre, apellidos, cargo')
    .eq('id', user.id)
    .single();
  const profile = profileRes.data;
  const displayName = profile?.nombre
    ? `${profile.nombre}${profile.apellidos ? ' ' + profile.apellidos : ''}`
    : user.email;
  const cargo = profile?.cargo ?? '';

  let modules = [];
  try { modules = await getAccessibleModules(user.id); }
  catch (_) { modules = []; }

  const enabled  = modules.filter(m => m.habilitado);
  const disabled = modules.filter(m => !m.habilitado);

  const navItems = enabled.map(m => {
    const url    = MODULE_URLS[m.slug] ?? '#';
    const active = m.slug === activeSlug;
    return `<a href="${url}" class="topnav-item${active ? ' active' : ''}">
      <i class="ti ${m.icono ?? 'ti-circle'}"></i>
      <span>${m.nombre}</span>
    </a>`;
  }).join('');

  const soonItems = disabled.length ? `
    <div class="topnav-soon-group">
      ${disabled.map(m => `
        <div class="topnav-item topnav-item--soon" title="${m.nombre} (próximamente)">
          <i class="ti ${m.icono ?? 'ti-circle'}"></i>
          <span>${m.nombre}</span>
        </div>`).join('')}
    </div>` : '';

  const shell = document.getElementById('platform-shell');
  if (!shell) return;

  shell.innerHTML = `
    <nav class="platform-topnav">
      <a class="topnav-brand" href="/platform/dashboard.html">
        <div class="topnav-logo">
          <img src="/W LOGO.png" alt="Wizard" />
        </div>
        <span class="topnav-brand-text">Wizard</span>
      </a>

      <div class="topnav-nav">
        ${navItems}
        ${soonItems}
      </div>

      <div class="topnav-links">
        <a href="/talleres/" target="_blank" class="topnav-ext-link" title="Ver vitrina de talleres">
          <i class="ti ti-school"></i>
        </a>
        <a href="/" target="_blank" class="topnav-ext-link" title="Ver menú público">
          <i class="ti ti-menu-2"></i>
        </a>
      </div>

      <div class="topnav-user">
        <div class="topnav-avatar">${displayName.charAt(0).toUpperCase()}</div>
        <div class="topnav-user-info">
          <span class="topnav-user-name">${displayName}</span>
          <span class="topnav-user-role">${cargo || user.email}</span>
        </div>
        <button class="topnav-logout" id="logout-btn" title="Cerrar sesión">
          <i class="ti ti-logout"></i>
        </button>
      </div>
    </nav>

    <div class="platform-main">
      <main class="platform-content" id="platform-content"></main>
    </div>
  `;

  document.getElementById('logout-btn')?.addEventListener('click', logout);
}
