import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROJECT_REF = Deno.env.get('SUPABASE_PROJECT_REF') ?? 'cwatxpuxttgeceahbciw';
const MGMT_API    = 'https://api.supabase.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Verificar que el caller tenga sesión válida de admin ──────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // ── Intentar Management API si existe el PAT ──────────────────────────
    const pat = Deno.env.get('MGMT_PAT');
    if (!pat) {
      return json({ status: 'no_pat', ref: PROJECT_REF });
    }

    const [usageRes, storageRes] = await Promise.all([
      fetch(`${MGMT_API}/v1/projects/${PROJECT_REF}/usage`, {
        headers: { Authorization: `Bearer ${pat}` },
      }),
      fetch(`${MGMT_API}/v1/projects/${PROJECT_REF}/storage`, {
        headers: { Authorization: `Bearer ${pat}` },
      }),
    ]);

    const usage   = usageRes.ok   ? await usageRes.json()   : null;
    const storage = storageRes.ok ? await storageRes.json() : null;

    // Normalizar métricas del endpoint /usage
    // Supabase devuelve { usage: [ { metric, usage, limit, cost }, ... ] }
    const metrics: Record<string, number | null> = {
      egress_bytes:   null,
      storage_bytes:  null,
      db_bytes:       null,
      mau:            null,
    };

    if (Array.isArray(usage?.usage)) {
      for (const item of usage.usage) {
        switch (item.metric) {
          case 'egress':        metrics.egress_bytes  = item.usage ?? null; break;
          case 'storage_size':  metrics.storage_bytes = item.usage ?? null; break;
          case 'db_size':       metrics.db_bytes      = item.usage ?? null; break;
          case 'monthly_active_users': metrics.mau    = item.usage ?? null; break;
        }
      }
    }

    return json({
      status:  'ok',
      ref:     PROJECT_REF,
      metrics,
      storage_raw: storage,
      usage_raw:   usage,
    });

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
