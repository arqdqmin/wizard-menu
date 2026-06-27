-- ============================================================
-- Wizard Platform — Módulo Talleres
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. TALLERES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.talleres (
  id            SERIAL       PRIMARY KEY,
  nombre        TEXT         NOT NULL,
  descripcion   TEXT,
  fecha         DATE,
  hora          TIME,
  imagen_url    TEXT,
  precio        INTEGER,
  cupos         INTEGER,
  link_pago     TEXT,
  -- Datos de transferencia (empresa)
  banco         TEXT,
  tipo_cuenta   TEXT,
  num_cuenta    TEXT,
  titular       TEXT,
  rut_titular   TEXT,
  email_titular TEXT,
  activo        BOOLEAN      DEFAULT TRUE,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 2. INSCRIPCIONES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.taller_inscripciones (
  id               SERIAL      PRIMARY KEY,
  taller_id        INTEGER     REFERENCES public.talleres(id) ON DELETE CASCADE,
  nombre           TEXT        NOT NULL,
  edad             INTEGER,
  nombre_apoderado TEXT,
  telefono         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. HABILITAR MÓDULO TALLERES ────────────────────────────
UPDATE public.modules SET habilitado = TRUE WHERE slug = 'talleres';

-- ── 4. PERMISOS: super_admin ya tiene todo por defecto ──────
-- Agregar permiso de talleres a rol 'talleres'
INSERT INTO public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
SELECT r.id, m.id, true, true, true
FROM public.roles r, public.modules m
WHERE r.nombre = 'talleres' AND m.slug = 'talleres'
ON CONFLICT (role_id, module_id) DO NOTHING;
