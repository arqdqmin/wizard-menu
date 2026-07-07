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
  ventas:       '/platform/ventas/index.html',
};

export async function initShell(activeSlug, pageTitle, initialModule = null) {
  const shell = document.getElementById('platform-shell');
  if (!shell) return;

  // ── Modo iframe: sólo renderiza el contenedor de contenido ───
  if (window.self !== window.top) {
    shell.innerHTML = `
      <div class="platform-main">
        <main class="platform-content" id="platform-content"></main>
      </div>`;
    return;
  }

  // ── Si se accede directamente (no iframe, no shell) → redirigir al shell ──
  if (activeSlug !== '__shell__') {
    const mod = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/platform/index.html?module=${mod}`);
    return;
  }

  // ── Autenticación ─────────────────────────────────────────────
  const session = await getSession();
  if (!session) {
    window.location.href = '/platform/login.html';
    return;
  }

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

  // ── Modo shell: topnav + iframe ──────────────────────────────
  const isShell = activeSlug === '__shell__';

  // Sobrescribe nombres largos para la barra
  const NAME_OVERRIDES = { 'Recursos Humanos': 'RRHH' };
  const displayNombre = m => NAME_OVERRIDES[m.nombre] ?? m.nombre;

  const navItems = enabled.map(m => {
    const url = MODULE_URLS[m.slug] ?? '#';
    if (isShell) {
      const isActive = m.slug === 'dashboard';
      return `<div class="topnav-item${isActive ? ' active' : ''}" data-slug="${m.slug}"
          onclick="window._frameNav('${url}', this)">
        <i class="ti ${m.icono ?? 'ti-circle'}"></i>
        <span>${displayNombre(m)}</span>
      </div>`;
    }
    const active = m.slug === activeSlug;
    return `<a href="${url}" class="topnav-item${active ? ' active' : ''}">
      <i class="ti ${m.icono ?? 'ti-circle'}"></i>
      <span>${displayNombre(m)}</span>
    </a>`;
  }).join('');

  const soonItems = disabled.length ? `
    <div class="topnav-soon-group">
      ${disabled.map(m => `
        <div class="topnav-item topnav-item--soon" title="${m.nombre} (próximamente)">
          <i class="ti ${m.icono ?? 'ti-circle'}"></i>
          <span>${displayNombre(m)}</span>
        </div>`).join('')}
    </div>` : '';

  const frameSrc = initialModule ? decodeURIComponent(initialModule) : '/platform/dashboard.html';
  const contentArea = isShell
    ? `<iframe id="platform-frame" class="platform-frame" src="${frameSrc}"></iframe>`
    : `<main class="platform-content" id="platform-content"></main>`;

  shell.innerHTML = `
    <nav class="platform-topnav">
      <a class="topnav-brand" href="${isShell ? 'javascript:window._frameNav(\'/platform/dashboard.html\')' : '/platform/dashboard.html'}">
        <div class="topnav-logo">
          <img src="/W LOGO.png" alt="Wizard" />
        </div>
        <span class="topnav-brand-text">Wizard Platform</span>
      </a>

      <div class="topnav-nav">
        ${navItems}
        ${soonItems}
      </div>

      <div class="topnav-links">
        <a href="/talleres/" target="_blank" class="topnav-item topnav-ext-link" title="Vitrina Talleres">
          <i class="ti ti-school"></i>
          <span>Vitrina Talleres</span>
        </a>
        <a href="/" target="_blank" class="topnav-item topnav-ext-link" title="Menú Público">
          <i class="ti ti-menu-2"></i>
          <span>Menú Público</span>
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
      ${contentArea}
    </div>
  `;

  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // ── Lógica exclusiva del modo shell ──────────────────────────
  if (isShell) {
    const frame = document.getElementById('platform-frame');

    window._frameNav = (url, el) => {
      frame.src = url;
      document.querySelectorAll('.topnav-item[data-slug]').forEach(i => i.classList.remove('active'));
      // Si se llama desde el brand link sin pasar el elemento
      if (el) el.classList.add('active');
      else {
        const slug = Object.entries(MODULE_URLS).find(([,u]) => u === url)?.[0];
        if (slug) document.querySelector(`[data-slug="${slug}"]`)?.classList.add('active');
      }
    };

    // Sincroniza la pestaña activa cuando el iframe termina de cargar
    frame.addEventListener('load', () => {
      try {
        const path = frame.contentWindow.location.pathname;
        document.querySelectorAll('.topnav-item[data-slug]').forEach(i => i.classList.remove('active'));
        for (const [slug, url] of Object.entries(MODULE_URLS)) {
          if (path === url || path === url.replace('index.html', '') || url.startsWith(path)) {
            document.querySelector(`[data-slug="${slug}"]`)?.classList.add('active');
            break;
          }
        }
      } catch (_) {}
    });
  }
}
