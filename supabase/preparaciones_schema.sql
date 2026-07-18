-- ============================================================
-- Wizard Platform — Preparaciones Propias
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.preparaciones (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text          NOT NULL,
  descripcion      text,
  unidad           text          NOT NULL DEFAULT 'unid.',
  rendimiento      numeric(12,4) NOT NULL DEFAULT 1,
  costo_por_unidad numeric(12,4) DEFAULT 0,
  activo           boolean       DEFAULT true,
  created_at       timestamptz   DEFAULT now()
);
ALTER TABLE public.preparaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preparaciones_all" ON public.preparaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.preparacion_recetas (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  preparacion_id uuid          NOT NULL REFERENCES public.preparaciones(id) ON DELETE CASCADE,
  ingrediente_id uuid          NOT NULL REFERENCES public.ingredientes(id) ON DELETE CASCADE,
  cantidad_neta  numeric(12,4) NOT NULL DEFAULT 1,
  unidad         text          DEFAULT 'unid.',
  merma          numeric(5,2)  DEFAULT 0
);
ALTER TABLE public.preparacion_recetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preparacion_recetas_all" ON public.preparacion_recetas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agregar preparacion_id a la tabla de recetas de productos
ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS preparacion_id uuid REFERENCES public.preparaciones(id) ON DELETE SET NULL;
