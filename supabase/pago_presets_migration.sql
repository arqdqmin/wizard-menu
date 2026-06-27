-- ============================================================
-- Wizard Platform — Tabla pago_presets
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pago_presets (
  id            SERIAL       PRIMARY KEY,
  nombre        TEXT         NOT NULL,
  tipo          TEXT         NOT NULL CHECK (tipo IN ('transferencia', 'link')),
  -- transferencia
  banco         TEXT,
  tipo_cuenta   TEXT,
  num_cuenta    TEXT,
  titular       TEXT,
  rut_titular   TEXT,
  email_titular TEXT,
  -- link de pago
  url           TEXT,
  descripcion   TEXT,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);
