-- Nuevas columnas para gastos generales en productos
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS costo_arriendo  numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_servicios numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_otros     numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utilidad_pct    numeric(5,2)  DEFAULT 30;
