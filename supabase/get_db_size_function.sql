-- Función para consultar el tamaño de la base de datos desde Edge Functions
CREATE OR REPLACE FUNCTION public.get_db_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_database_size(current_database());
$$;
