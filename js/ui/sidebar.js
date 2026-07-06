import { supabase }             from '../core/supabase.js';
import { getSession, logout }   from '../core/auth.js';
import { getAccessibleModules } from '../core/permissions.js';

// Mapa de slug → URL de la página
const MODULE_URLS = {
  dashboard:    '/platform/dashboard.html',
  menu:         '/admin.html',
  usuarios:     '/platform/users.html',
  talleres:     '/platform/talleres.html',
  marketing:    '/platform/marketing.html',
  configuracion:'/platform/settings.html',
  wcontrol:     '/platform/wcontrol/index.html',
};

/**
 * Inyecta el shell de administración (sidebar + header) en el body.
 * Debe llamarse antes de renderizar el contenido de la página.
 *
 * @param {string} activeSlug - Slug del módulo activo para resaltarlo en el sidebar
 * @param {string} pageTitle  - Título que aparece en el header
 */
export async function initShell(activeSlug, pageTitle) {
  const session = await getSession();
  if (!session) return;

  const user      = session.user;
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

  // Separar módulos habilitados y deshabilitados (próximamente)
  const enabled  = modules.filter(m => m.habilitado);
  const disabled = modules.filter(m => !m.habilitado);

  const sidebarItems = enabled.map(m => {
    const url    = MODULE_URLS[m.slug] ?? '#';
    const active = m.slug === activeSlug;
    return `<a href="${url}" class="sidebar-item${active ? ' active' : ''}">
      <i class="ti ${m.icono ?? 'ti-circle'}"></i>
      <span>${m.nombre}</span>
    </a>`;
  }).join('');

  const comingSoon = disabled.length ? `
    <div class="sidebar-section-label">Próximamente</div>
    ${disabled.map(m => `
      <div class="sidebar-item sidebar-item--soon">
        <i class="ti ${m.icono ?? 'ti-circle'}"></i>
        <span>${m.nombre}</span>
        <span class="soon-badge">Pronto</span>
      </div>`).join('')}
  ` : '';

  const shell = document.getElementById('platform-shell');
  if (!shell) return;

  shell.innerHTML = `
    <aside class="platform-sidebar" id="platform-sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-logo">
          <img src="/W LOGO.png" alt="Wizard" />
        </div>
        <div class="sidebar-brand-text">
          <span class="sidebar-brand-name">Wizard Platform</span>
          <span class="sidebar-brand-sub">The Wizard Coffee</span>
        </div>
        <button class="sidebar-close" id="sidebar-close-btn" aria-label="Cerrar menú">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <nav class="sidebar-nav">
        ${sidebarItems}
        ${comingSoon}
      </nav>

      <div class="sidebar-user">
        <div class="sidebar-user-avatar">
          ${displayName.charAt(0).toUpperCase()}
        </div>
        <div class="sidebar-user-info">
          <span class="sidebar-user-name">${displayName}</span>
          <span class="sidebar-user-role">${cargo || user.email}</span>
        </div>
        <button class="sidebar-logout-btn" id="logout-btn" title="Cerrar sesión">
          <i class="ti ti-logout"></i>
        </button>
      </div>
    </aside>

    <div class="platform-overlay" id="platform-overlay"></div>

    <div class="platform-main">
      <header class="platform-header">
        <button class="header-menu-btn" id="sidebar-open-btn" aria-label="Abrir menú">
          <i class="ti ti-menu-2"></i>
        </button>
        <h1 class="platform-page-title">${pageTitle}</h1>
        <div class="header-spacer"></div>
        <a href="/talleres/" target="_blank" class="header-view-menu" title="Ver vitrina de talleres" style="margin-right:4px">
          <i class="ti ti-external-link"></i> Talleres
        </a>
        <a href="/" target="_blank" class="header-view-menu" title="Ver menú público">
          <i class="ti ti-external-link"></i> Ver menú
        </a>
      </header>
      <main class="platform-content" id="platform-content"></main>
    </div>
  `;

  // Eventos sidebar móvil
  document.getElementById('sidebar-open-btn')?.addEventListener('click', () => {
    document.getElementById('platform-sidebar')?.classList.add('open');
    document.getElementById('platform-overlay')?.classList.add('visible');
  });
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeSidebar);
  document.getElementById('platform-overlay')?.addEventListener('click', closeSidebar);
  document.getElementById('logout-btn')?.addEventListener('click', logout);
}

function closeSidebar() {
  document.getElementById('platform-sidebar')?.classList.remove('open');
  document.getElementById('platform-overlay')?.classList.remove('visible');
}
