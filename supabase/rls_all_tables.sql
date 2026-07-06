-- ══════════════════════════════════════════════════════════════
-- RLS completo para Wizard Platform
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── 1. TABLAS DE LECTURA PÚBLICA ──────────────────────────────
-- Cualquiera puede leer (menú, talleres, screens, configuracion)
-- Solo autenticados pueden escribir (admin panel)

-- products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_public" ON public.products;
DROP POLICY IF EXISTS "write_auth"  ON public.products;
CREATE POLICY "read_public" ON public.products FOR SELECT USING (true);
CREATE POLICY "write_auth"  ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_public" ON public.categories;
DROP POLICY IF EXISTS "write_auth"  ON public.categories;
CREATE POLICY "read_public" ON public.categories FOR SELECT USING (true);
CREATE POLICY "write_auth"  ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- banners
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_public" ON public.banners;
DROP POLICY IF EXISTS "write_auth"  ON public.banners;
CREATE POLICY "read_public" ON public.banners FOR SELECT USING (true);
CREATE POLICY "write_auth"  ON public.banners FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- talleres
ALTER TABLE public.talleres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_public" ON public.talleres;
DROP POLICY IF EXISTS "write_auth"  ON public.talleres;
CREATE POLICY "read_public" ON public.talleres FOR SELECT USING (true);
CREATE POLICY "write_auth"  ON public.talleres FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- taller_fechas
ALTER TABLE public.taller_fechas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_public" ON public.taller_fechas;
DROP POLICY IF EXISTS "write_auth"  ON public.taller_fechas;
CREATE POLICY "read_public" ON public.taller_fechas FOR SELECT USING (true);
CREATE POLICY "write_auth"  ON public.taller_fechas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- screens
ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_public" ON public.screens;
DROP POLICY IF EXISTS "write_auth"  ON public.screens;
CREATE POLICY "read_public" ON public.screens FOR SELECT USING (true);
CREATE POLICY "write_auth"  ON public.screens FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. TABLAS SOLO PARA USUARIOS AUTENTICADOS ─────────────────
-- Solo el admin panel (usuarios logueados) puede leer y escribir

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_auth"  ON public.profiles;
DROP POLICY IF EXISTS "write_auth" ON public.profiles;
CREATE POLICY "read_auth"  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_auth" ON public.profiles FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- roles
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_auth"  ON public.roles;
DROP POLICY IF EXISTS "write_auth" ON public.roles;
CREATE POLICY "read_auth"  ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_auth" ON public.roles FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_auth"  ON public.user_roles;
DROP POLICY IF EXISTS "write_auth" ON public.user_roles;
CREATE POLICY "read_auth"  ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_auth" ON public.user_roles FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_auth"  ON public.role_permissions;
DROP POLICY IF EXISTS "write_auth" ON public.role_permissions;
CREATE POLICY "read_auth"  ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_auth" ON public.role_permissions FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_auth"  ON public.audit_logs;
DROP POLICY IF EXISTS "write_auth" ON public.audit_logs;
CREATE POLICY "read_auth"  ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_auth" ON public.audit_logs FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- pago_presets
ALTER TABLE public.pago_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_auth"  ON public.pago_presets;
DROP POLICY IF EXISTS "write_auth" ON public.pago_presets;
CREATE POLICY "read_auth"  ON public.pago_presets FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_auth" ON public.pago_presets FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- modules
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_auth"  ON public.modules;
DROP POLICY IF EXISTS "write_auth" ON public.modules;
CREATE POLICY "read_auth"  ON public.modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_auth" ON public.modules FOR ALL    TO authenticated USING (true) WITH CHECK (true);
