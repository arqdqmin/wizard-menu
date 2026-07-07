CREATE TABLE IF NOT EXISTS public.grupo_modificador_opciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id        uuid REFERENCES public.grupos_modificadores(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  precio_adicional numeric(12,2) DEFAULT 0,
  max_cantidad    integer DEFAULT 1,
  activo          boolean DEFAULT true,
  orden           integer DEFAULT 0,
  creado_en       timestamptz DEFAULT now()
);

ALTER TABLE public.grupo_modificador_opciones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='auth_gmo' AND tablename='grupo_modificador_opciones') THEN
    CREATE POLICY auth_gmo ON public.grupo_modificador_opciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
