-- ============================================================
-- POS — Zonas y Mesas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Zonas del local
CREATE TABLE IF NOT EXISTS public.zonas (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre    text NOT NULL,
  orden     integer DEFAULT 0,
  activa    boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Mesas con posición visual en el plano
CREATE TABLE IF NOT EXISTS public.mesas (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero      text NOT NULL,
  zona_id     uuid REFERENCES public.zonas(id) ON DELETE CASCADE,
  capacidad   integer DEFAULT 4,
  forma       text DEFAULT 'cuadrado',   -- cuadrado | redondo
  pos_x       integer DEFAULT 50,
  pos_y       integer DEFAULT 50,
  estado      text DEFAULT 'libre',      -- libre | ocupada | cuenta | reservada
  activa      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.zonas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_zonas_all" ON public.zonas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_mesas_all" ON public.mesas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mesas_zona ON public.mesas (zona_id);
CREATE INDEX IF NOT EXISTS idx_mesas_estado ON public.mesas (estado);

-- Datos iniciales
INSERT INTO zonas (nombre, orden) VALUES ('1er Piso', 1), ('Exterior', 2)
ON CONFLICT DO NOTHING;
