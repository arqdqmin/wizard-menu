-- Agregar campos de edad al taller
ALTER TABLE public.talleres ADD COLUMN IF NOT EXISTS edad_min INTEGER;
ALTER TABLE public.talleres ADD COLUMN IF NOT EXISTS edad_max INTEGER;
