import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Verificar que el caller sea admin ─────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user: caller }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !caller) return json({ error: 'Unauthorized' }, 401);

    // Verificar que el caller tenga rol admin o super_admin
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await adminClient
      .from('user_roles')
      .select('roles(nombre)')
      .eq('user_id', caller.id);

    const roleNames = (roles ?? []).map((r: any) => r.roles?.nombre).filter(Boolean);
    const isAdmin = roleNames.some((r: string) => ['super_admin', 'administrador'].includes(r));
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    // ── Crear usuario ─────────────────────────────────────────────────────
    const { email, password, nombre, apellidos, cargo, role_ids } = await req.json();

    if (!email || !password) return json({ error: 'Email y contraseña requeridos' }, 400);
    if (password.length < 6)  return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);

    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // sin email de confirmación
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const uid = newUser.user!.id;

    // Crear perfil
    await adminClient.from('profiles').upsert({
      id: uid,
      nombre:    nombre    ?? '',
      apellidos: apellidos ?? '',
      cargo:     cargo     ?? '',
      estado:    'activo',
    });

    // Asignar roles
    if (Array.isArray(role_ids) && role_ids.length) {
      await adminClient.from('user_roles').insert(
        role_ids.map((rid: number) => ({ user_id: uid, role_id: rid }))
      );
    }

    return json({ ok: true, user_id: uid });

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
