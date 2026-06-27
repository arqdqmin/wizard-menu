import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

  try {
    // ── Auth: requiere admin o super_admin ────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const anonClient  = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await adminClient
      .from('user_roles').select('roles(nombre)').eq('user_id', user.id);
    const roleNames = (roles ?? []).map((r: any) => r.roles?.nombre).filter(Boolean);
    const isAdmin = roleNames.some((r: string) => ['super_admin', 'administrador', 'talleres'].includes(r));
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    const url    = new URL(req.url);
    const method = req.method;

    // ── GET /inscripciones?taller_id=X&search=Y ───────────────────────────
    if (method === 'GET') {
      const tallerId = url.searchParams.get('taller_id');
      const search   = url.searchParams.get('search') ?? '';

      let q = adminClient
        .from('taller_inscripciones')
        .select('*, talleres(nombre)')
        .order('created_at', { ascending: false });

      if (tallerId) q = q.eq('taller_id', tallerId);
      if (search)   q = q.or(`nombre.ilike.%${search}%,telefono.ilike.%${search}%`);

      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // ── DELETE /inscripciones?id=X ────────────────────────────────────────
    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id requerido' }, 400);

      const { error } = await adminClient
        .from('taller_inscripciones').delete().eq('id', id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
