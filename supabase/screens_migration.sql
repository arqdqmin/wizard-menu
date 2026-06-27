-- Habilitar módulo Marketing
UPDATE public.modules SET habilitado = TRUE WHERE slug = 'marketing';

-- Tabla de pantallas (Screens)
CREATE TABLE IF NOT EXISTS public.screens (
  id         SERIAL       PRIMARY KEY,
  nombre     TEXT,
  imagen_url TEXT         NOT NULL,
  rotacion   INTEGER      DEFAULT 0 CHECK (rotacion IN (0, 90, 180, 270)),
  duracion   INTEGER      DEFAULT 5,   -- segundos por slide
  orden      INTEGER      DEFAULT 0,
  activo     BOOLEAN      DEFAULT TRUE,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);
