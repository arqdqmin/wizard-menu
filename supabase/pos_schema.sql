-- ── POS: Comandas confirmadas (enviadas a cocina) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_comandas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          bigint GENERATED ALWAYS AS IDENTITY,
  mesa_id         uuid REFERENCES public.mesas(id) ON DELETE SET NULL,
  mesa_numero     text,
  zona_nombre     text,
  cocina_id       uuid REFERENCES public.cocinas(id) ON DELETE SET NULL,
  cocina_nombre   text NOT NULL DEFAULT 'General',
  estado          text NOT NULL DEFAULT 'pendiente',  -- pendiente | preparando | listo
  personas        integer DEFAULT 1,
  hora_inicio     timestamptz DEFAULT now(),
  hora_preparando timestamptz,
  hora_listo      timestamptz
);

ALTER TABLE public.pos_comandas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='auth_pos_comandas' AND tablename='pos_comandas') THEN
    CREATE POLICY auth_pos_comandas ON public.pos_comandas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── POS: Ítems de cada comanda ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_comanda_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id    uuid REFERENCES public.pos_comandas(id) ON DELETE CASCADE,
  producto_id   uuid,
  nombre        text NOT NULL,
  precio        numeric(12,2) DEFAULT 0,
  cantidad      integer DEFAULT 1,
  comentario    text,
  modificadores jsonb DEFAULT '[]',
  estado        text NOT NULL DEFAULT 'pendiente'  -- pendiente | preparando | listo
);

ALTER TABLE public.pos_comanda_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='auth_pos_comanda_items' AND tablename='pos_comanda_items') THEN
    CREATE POLICY auth_pos_comanda_items ON public.pos_comanda_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Vinculo: productos ↔ grupos modificadores ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.producto_grupos_modificadores (
  producto_id uuid REFERENCES public.productos(id) ON DELETE CASCADE,
  grupo_id    uuid REFERENCES public.grupos_modificadores(id) ON DELETE CASCADE,
  orden       integer DEFAULT 0,
  PRIMARY KEY (producto_id, grupo_id)
);

ALTER TABLE public.producto_grupos_modificadores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='auth_pgm' AND tablename='producto_grupos_modificadores') THEN
    CREATE POLICY auth_pgm ON public.producto_grupos_modificadores FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
