-- Agrega columna visible a la tabla products (carta pública)
-- visible = true  → se muestra en la carta de clientes (default)
-- visible = false → oculto de la carta de clientes

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE;
