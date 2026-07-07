-- Registrar módulo en la plataforma
INSERT INTO public.modules (nombre, slug, habilitado, icono, orden, descripcion)
VALUES ('Ventas', 'ventas', true, 'ti-cash-register', 12, 'Ventas, arqueos y propinas')
ON CONFLICT (slug) DO UPDATE SET habilitado = true, icono = 'ti-cash-register';

-- pos_ventas: registro de cierres de mesa
CREATE TABLE IF NOT EXISTS public.pos_ventas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          bigint GENERATED ALWAYS AS IDENTITY,
  mesa_id         uuid REFERENCES public.mesas(id) ON DELETE SET NULL,
  mesa_numero     text,
  zona_nombre     text,
  estado          text NOT NULL DEFAULT 'cerrado',
  personas        integer DEFAULT 1,
  subtotal        numeric(12,2) DEFAULT 0,
  descuento_tipo  text,          -- '%' o '$'
  descuento_valor numeric(12,2) DEFAULT 0,
  descuento_monto numeric(12,2) DEFAULT 0,
  propina         numeric(12,2) DEFAULT 0,
  total           numeric(12,2) DEFAULT 0,
  garzon_nombre   text,
  tipo_venta      text NOT NULL DEFAULT 'mesa',  -- 'mesa' | 'mostrador'
  hora_inicio     timestamptz,
  hora_cierre     timestamptz DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.pos_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pos_ventas_all" ON public.pos_ventas;
CREATE POLICY "pos_ventas_all" ON public.pos_ventas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pos_venta_pagos: métodos de pago y propinas por venta
CREATE TABLE IF NOT EXISTS public.pos_venta_pagos (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id  uuid REFERENCES public.pos_ventas(id) ON DELETE CASCADE,
  metodo    text NOT NULL,   -- 'Efectivo', 'Tarj. Débito', 'Tarj. Crédito', 'Transferencia'
  monto     numeric(12,2) DEFAULT 0,
  tipo      text NOT NULL DEFAULT 'pago'  -- 'pago' | 'propina'
);

-- Columnas para tablas ya existentes (idempotente)
ALTER TABLE public.pos_ventas ADD COLUMN IF NOT EXISTS garzon_nombre text;
ALTER TABLE public.pos_ventas ADD COLUMN IF NOT EXISTS tipo_venta text NOT NULL DEFAULT 'mesa';

ALTER TABLE public.pos_venta_pagos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pos_venta_pagos_all" ON public.pos_venta_pagos;
CREATE POLICY "pos_venta_pagos_all" ON public.pos_venta_pagos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
