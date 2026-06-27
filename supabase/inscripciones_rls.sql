-- Habilitar RLS en taller_inscripciones
ALTER TABLE public.taller_inscripciones ENABLE ROW LEVEL SECURITY;

-- Público puede insertar (formulario de inscripción)
CREATE POLICY "anon_insert" ON public.taller_inscripciones
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Solo service_role puede leer, actualizar y eliminar (via Edge Function)
CREATE POLICY "service_select" ON public.taller_inscripciones
  FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY "service_delete" ON public.taller_inscripciones
  FOR DELETE USING (auth.role() = 'service_role');

CREATE POLICY "service_update" ON public.taller_inscripciones
  FOR UPDATE USING (auth.role() = 'service_role');
