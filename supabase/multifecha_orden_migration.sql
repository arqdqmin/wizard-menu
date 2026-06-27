-- Orden manual de talleres
ALTER TABLE public.talleres ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;

-- Flag de múltiples fechas/horarios
ALTER TABLE public.talleres ADD COLUMN IF NOT EXISTS multi_fecha BOOLEAN DEFAULT FALSE;

-- Fechas múltiples por taller
CREATE TABLE IF NOT EXISTS public.taller_fechas (
  id         SERIAL      PRIMARY KEY,
  taller_id  INTEGER     REFERENCES public.talleres(id) ON DELETE CASCADE,
  nombre     TEXT,
  fecha      DATE,
  hora       TIME,
  orden      INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fecha elegida en inscripciones
ALTER TABLE public.taller_inscripciones ADD COLUMN IF NOT EXISTS taller_fecha_id INTEGER REFERENCES public.taller_fechas(id);
ALTER TABLE public.taller_inscripciones ADD COLUMN IF NOT EXISTS fecha_elegida TEXT;
