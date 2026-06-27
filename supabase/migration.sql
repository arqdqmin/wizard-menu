-- ============================================================
-- Wizard Platform — Migration v1.0
-- Ejecutar en Supabase SQL Editor (en orden)
-- ============================================================

-- ── 1. PROFILES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre      TEXT,
  apellidos   TEXT,
  cargo       TEXT,
  estado      TEXT        DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_access TIMESTAMPTZ,
  observaciones TEXT
);

-- ── 2. ROLES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id          SERIAL      PRIMARY KEY,
  nombre      TEXT        UNIQUE NOT NULL,
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. USER_ROLES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID    REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES public.roles(id)    ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- ── 4. MODULES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.modules (
  id          SERIAL  PRIMARY KEY,
  nombre      TEXT    NOT NULL,
  slug        TEXT    UNIQUE NOT NULL,
  habilitado  BOOLEAN DEFAULT FALSE,
  icono       TEXT,
  orden       INTEGER DEFAULT 99,
  descripcion TEXT
);

-- ── 5. ROLE_PERMISSIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id    INTEGER REFERENCES public.roles(id)   ON DELETE CASCADE,
  module_id  INTEGER REFERENCES public.modules(id) ON DELETE CASCADE,
  can_read   BOOLEAN DEFAULT TRUE,
  can_write  BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (role_id, module_id)
);

-- ── 6. AUDIT_LOGS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           BIGSERIAL   PRIMARY KEY,
  user_id      UUID        REFERENCES public.profiles(id),
  user_name    TEXT,
  timestamp    TIMESTAMPTZ DEFAULT NOW(),
  module       TEXT        NOT NULL,
  action       TEXT        NOT NULL,
  record_id    TEXT,
  record_label TEXT,
  old_values   JSONB,
  new_values   JSONB,
  ip_address   TEXT,
  user_agent   TEXT
);

-- ── INITIAL DATA: ROLES ─────────────────────────────────────
INSERT INTO public.roles (nombre, descripcion) VALUES
  ('super_admin',   'Acceso total a la plataforma'),
  ('administrador', 'Administración general del negocio'),
  ('personal',      'Gestión de personal y turnos'),
  ('marketing',     'Gestión de marketing y contenido'),
  ('talleres',      'Gestión de talleres y cursos')
ON CONFLICT (nombre) DO NOTHING;

-- ── INITIAL DATA: MODULES ───────────────────────────────────
INSERT INTO public.modules (nombre, slug, habilitado, icono, orden, descripcion) VALUES
  ('Dashboard',     'dashboard',    true,  'ti-dashboard',       1,  'Panel principal'),
  ('Menú',          'menu',         true,  'ti-tools-kitchen-2', 2,  'Gestión del menú digital'),
  ('Usuarios',      'usuarios',     true,  'ti-users',           3,  'Gestión de usuarios y roles'),
  ('Personal',      'personal',     false, 'ti-id-badge',        4,  'Gestión de personal'),
  ('Talleres',      'talleres',     false, 'ti-school',          5,  'Gestión de talleres'),
  ('Marketing',     'marketing',    false, 'ti-speakerphone',    6,  'Marketing y promociones'),
  ('Eventos',       'eventos',      false, 'ti-calendar-event',  7,  'Gestión de eventos'),
  ('Reservas',      'reservas',     false, 'ti-calendar-time',   8,  'Sistema de reservas'),
  ('Estadísticas',  'estadisticas', false, 'ti-chart-bar',       9,  'Reportes y estadísticas'),
  ('Clientes',      'clientes',     false, 'ti-user-heart',      10, 'Gestión de clientes'),
  ('Fidelización',  'fidelizacion', false, 'ti-star',            11, 'Programa de fidelización'),
  ('Configuración', 'configuracion',true,  'ti-settings',        99, 'Configuración del sistema')
ON CONFLICT (slug) DO NOTHING;

-- ── INITIAL DATA: PERMISSIONS — super_admin ─────────────────
INSERT INTO public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
SELECT r.id, m.id, true, true, true
FROM public.roles r, public.modules m
WHERE r.nombre = 'super_admin'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- ── INITIAL DATA: PERMISSIONS — administrador ───────────────
INSERT INTO public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
SELECT r.id, m.id, true, true, false
FROM public.roles r, public.modules m
WHERE r.nombre = 'administrador'
  AND m.slug IN ('dashboard','menu','usuarios','estadisticas','clientes')
ON CONFLICT (role_id, module_id) DO NOTHING;

-- ── INITIAL DATA: PERMISSIONS — marketing ───────────────────
INSERT INTO public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
SELECT r.id, m.id, true, true, false
FROM public.roles r, public.modules m
WHERE r.nombre = 'marketing'
  AND m.slug IN ('dashboard','marketing','eventos')
ON CONFLICT (role_id, module_id) DO NOTHING;

-- ── INITIAL DATA: PERMISSIONS — talleres ────────────────────
INSERT INTO public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
SELECT r.id, m.id, true, true, false
FROM public.roles r, public.modules m
WHERE r.nombre = 'talleres'
  AND m.slug IN ('dashboard','talleres','clientes')
ON CONFLICT (role_id, module_id) DO NOTHING;

-- ── INITIAL DATA: PERMISSIONS — personal ────────────────────
INSERT INTO public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
SELECT r.id, m.id, true, true, false
FROM public.roles r, public.modules m
WHERE r.nombre = 'personal'
  AND m.slug IN ('dashboard','personal')
ON CONFLICT (role_id, module_id) DO NOTHING;

-- ── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs     ENABLE ROW LEVEL SECURITY;

-- profiles: propio usuario o admins
DROP POLICY IF EXISTS "profiles_own_read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all"  ON public.profiles;
CREATE POLICY "profiles_own_read" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ro.nombre IN ('super_admin','administrador')
    )
  );

-- roles: lectura para autenticados
DROP POLICY IF EXISTS "roles_auth_read" ON public.roles;
CREATE POLICY "roles_auth_read" ON public.roles
  FOR SELECT TO authenticated USING (true);
-- super_admin puede gestionar roles
DROP POLICY IF EXISTS "roles_superadmin_write" ON public.roles;
CREATE POLICY "roles_superadmin_write" ON public.roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND ro.nombre = 'super_admin'
    )
  );

-- role_permissions: lectura para autenticados, super_admin escribe
DROP POLICY IF EXISTS "rp_auth_read"       ON public.role_permissions;
DROP POLICY IF EXISTS "rp_superadmin_write" ON public.role_permissions;
CREATE POLICY "rp_auth_read" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rp_superadmin_write" ON public.role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND ro.nombre = 'super_admin'
    )
  );

-- modules: lectura autenticados, escribe super_admin/admin
DROP POLICY IF EXISTS "modules_auth_read"      ON public.modules;
DROP POLICY IF EXISTS "modules_admin_write"    ON public.modules;
CREATE POLICY "modules_auth_read" ON public.modules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "modules_admin_write" ON public.modules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ro.nombre IN ('super_admin','administrador')
    )
  );

-- user_roles: propio usuario lee, admins gestionan todo
DROP POLICY IF EXISTS "ur_own_read"   ON public.user_roles;
DROP POLICY IF EXISTS "ur_admin_all"  ON public.user_roles;
CREATE POLICY "ur_own_read" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ur_admin_all" ON public.user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ro.nombre IN ('super_admin','administrador')
    )
  );

-- audit_logs: insert propio, lectura admins
DROP POLICY IF EXISTS "al_insert"     ON public.audit_logs;
DROP POLICY IF EXISTS "al_admin_read" ON public.audit_logs;
CREATE POLICY "al_insert" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "al_admin_read" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ro.nombre IN ('super_admin','administrador')
    )
  );

-- ── EXISTING TABLES: RLS ────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners    ENABLE ROW LEVEL SECURITY;

-- Lectura pública (menú)
DROP POLICY IF EXISTS "cat_public_read"  ON public.categories;
DROP POLICY IF EXISTS "prod_public_read" ON public.products;
DROP POLICY IF EXISTS "ban_public_read"  ON public.banners;
CREATE POLICY "cat_public_read"  ON public.categories FOR SELECT USING (true);
CREATE POLICY "prod_public_read" ON public.products   FOR SELECT USING (true);
CREATE POLICY "ban_public_read"  ON public.banners    FOR SELECT USING (true);

-- Escritura: autenticados con permiso en módulo menú
DROP POLICY IF EXISTS "cat_auth_write"  ON public.categories;
DROP POLICY IF EXISTS "prod_auth_write" ON public.products;
DROP POLICY IF EXISTS "ban_auth_write"  ON public.banners;

CREATE POLICY "cat_auth_write" ON public.categories
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      LEFT JOIN public.role_permissions rp ON rp.role_id = ro.id
      LEFT JOIN public.modules mo ON mo.id = rp.module_id
      WHERE ur.user_id = auth.uid()
        AND (ro.nombre = 'super_admin' OR (mo.slug = 'menu' AND rp.can_write = true))
    )
  );
CREATE POLICY "prod_auth_write" ON public.products
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      LEFT JOIN public.role_permissions rp ON rp.role_id = ro.id
      LEFT JOIN public.modules mo ON mo.id = rp.module_id
      WHERE ur.user_id = auth.uid()
        AND (ro.nombre = 'super_admin' OR (mo.slug = 'menu' AND rp.can_write = true))
    )
  );
CREATE POLICY "ban_auth_write" ON public.banners
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      LEFT JOIN public.role_permissions rp ON rp.role_id = ro.id
      LEFT JOIN public.modules mo ON mo.id = rp.module_id
      WHERE ur.user_id = auth.uid()
        AND (ro.nombre = 'super_admin' OR (mo.slug = 'menu' AND rp.can_write = true))
    )
  );

-- ── TRIGGERS ────────────────────────────────────────────────

-- Auto-crear profile al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
