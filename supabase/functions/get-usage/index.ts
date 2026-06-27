import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROJECT_REF = 'cwatxpuxttgeceahbciw';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const PAT          = Deno.env.get('MGMT_PAT');
const MGMT         = 'https://api.supabase.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth guard ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const metrics: Record<string, number | null> = {
      egress_bytes:  null,
      storage_bytes: null,
      db_bytes:      null,
      mau:           null,
    };
    const debug: Record<string, unknown> = {};

    // ── 1. DB size via RPC (requiere función SQL instalada) ───────────────
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_db_size`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (r.ok) {
        const val = await r.json();
        metrics.db_bytes = typeof val === 'number' ? val : null;
      }
      debug.db_rpc_status = r.status;
    } catch (e) { debug.db_rpc_err = String(e); }

    // ── 2. Storage size via RPC ───────────────────────────────────────────
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_storage_size`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (r.ok) {
        const val = await r.json();
        metrics.storage_bytes = typeof val === 'number' ? val : null;
      }
      debug.storage_rpc_status = r.status;
    } catch (e) { debug.storage_err = String(e); }

    // ── 3. MAU desde auth.users via RPC ──────────────────────────────────
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_mau`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (r.ok) {
        const val = await r.json();
        metrics.mau = typeof val === 'number' ? val : null;
      }
    } catch (_) {}

    // ── 4. Egress via Management API (intento) ────────────────────────────
    if (PAT) {
      // Obtener org_slug del proyecto
      let orgSlug = '';
      try {
        const projR = await fetch(`${MGMT}/v1/projects/${PROJECT_REF}`, {
          headers: { Authorization: `Bearer ${PAT}` },
        });
        if (projR.ok) {
          const proj = await projR.json() as Record<string, string>;
          orgSlug = proj.organization_slug ?? '';
          debug.org_slug = orgSlug;
        }
      } catch (_) {}

      // Probar endpoints de uso a nivel organización y proyecto
      const candidates = [
        orgSlug ? `${MGMT}/v1/organizations/${orgSlug}/usage` : '',
        `${MGMT}/v1/projects/${PROJECT_REF}/usage/api-counts`,
        `${MGMT}/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all`,
      ].filter(Boolean);

      for (const url of candidates) {
        try {
          const r = await fetch(url, { headers: { Authorization: `Bearer ${PAT}` } });
          console.log(url, '→', r.status);
          if (r.ok) {
            const body = await r.json();
            console.log('body:', JSON.stringify(body).slice(0, 400));
            debug[url] = body;

            // Parsear cualquier formato
            const arr = Array.isArray(body) ? body
                      : Array.isArray(body?.usage) ? body.usage
                      : typeof body === 'object' ? Object.entries(body).map(([k,v]) => ({ metric: k, ...(typeof v === 'object' && v !== null ? v as object : { usage: v }) }))
                      : [];

            for (const item of arr) {
              const k = String((item as Record<string,unknown>).metric ?? (item as Record<string,unknown>).name ?? '').toLowerCase();
              const v = ((item as Record<string,unknown>).usage ?? (item as Record<string,unknown>).value ?? null) as number | null;
              if (k.includes('egress'))                          metrics.egress_bytes  = v;
              else if (k.includes('storage'))                    metrics.storage_bytes = v;
              else if (k.includes('mau') || k.includes('active_user')) metrics.mau    = v;
            }
            break;
          }
        } catch (e) { console.log('err', url, e); }
      }
    }

    return json({ status: 'ok', metrics, debug });

  } catch (e) {
    console.error('fatal:', e);
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
