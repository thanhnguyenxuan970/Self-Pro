// Supabase Edge Function: the only path allowed to write to public.feedback.
//
// Migration 034 revoked direct anon/authenticated INSERT on feedback, because
// the previous client-side-only rate limit (AsyncStorage cooldown) is
// trivially bypassed by calling PostgREST directly with the public anon key,
// and each row fans out to an email via the feedback-email webhook (Resend
// free tier: 100/day). This function enforces a per-IP cooldown + daily cap
// server-side before writing, using the service-role key to bypass RLS.
//
// No secrets need manual configuration — SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically into every Edge
// Function's runtime by Supabase.
//
// Deploy: supabase functions deploy feedback-submit --no-verify-jwt
//
// Request body:  { type, message, userEmail, appVersion, device, osVersion }
// Response body: { result: 'OK' | 'INVALID' | 'RATE_LIMITED' | 'FAILED' }
// (always HTTP 200 for expected outcomes; non-200 only for genuine
// misconfiguration/transport failure, which the client treats as FAILED)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

const COOLDOWN_SECONDS = 60; // mirrors FEEDBACK_COOLDOWN_MS in src/utils/feedbackLogic.ts
const DAILY_CAP_PER_IP = 20; // guards the shared Resend 100/day quota against slow-drip abuse
const MIN_LENGTH = 3; // mirrors FEEDBACK_MIN_LENGTH
const MAX_LENGTH = 2000; // mirrors FEEDBACK_MAX_LENGTH
const VALID_TYPES = ['BUG', 'SUGGESTION', 'OTHER'];

function respond(result: string, status = 200): Response {
  return new Response(JSON.stringify({ result }), { status, headers: JSON_HEADERS });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? 'unknown';
}

async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

type ParsedBody = {
  type: string;
  message: string;
  userEmail: string | null;
  appVersion: string | null;
  device: string | null;
  osVersion: string | null;
};

async function parseBody(req: Request): Promise<ParsedBody | null> {
  try {
    const body = await req.json();
    if (typeof body.message !== 'string' || typeof body.type !== 'string') return null;
    return {
      type: body.type,
      message: body.message,
      userEmail: typeof body.userEmail === 'string' ? body.userEmail : null,
      appVersion: typeof body.appVersion === 'string' ? body.appVersion : null,
      device: typeof body.device === 'string' ? body.device : null,
      osVersion: typeof body.osVersion === 'string' ? body.osVersion : null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const restUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!restUrl || !serviceKey) return respond('FAILED', 500);

  const parsed = await parseBody(req);
  if (!parsed) return respond('INVALID');

  const trimmed = parsed.message.trim();
  if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH || !VALID_TYPES.includes(parsed.type)) {
    return respond('INVALID');
  }

  const ipHash = await hashIp(clientIp(req));
  const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // Per-IP cooldown: any row for this ip_hash in the last COOLDOWN_SECONDS.
  const cooldownSince = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();
  const cooldownRes = await fetch(
    `${restUrl}/rest/v1/feedback?select=id&ip_hash=eq.${ipHash}&created_at=gte.${cooldownSince}&limit=1`,
    { headers: restHeaders },
  );
  if (!cooldownRes.ok) return respond('FAILED', 502);
  if ((await cooldownRes.json()).length > 0) return respond('RATE_LIMITED');

  // Daily cap: total rows for this ip_hash in the last 24h, via exact count.
  const daySince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const capRes = await fetch(
    `${restUrl}/rest/v1/feedback?select=id&ip_hash=eq.${ipHash}&created_at=gte.${daySince}`,
    { headers: { ...restHeaders, Prefer: 'count=exact', Range: '0-0' } },
  );
  if (!capRes.ok) return respond('FAILED', 502);
  const total = Number(capRes.headers.get('content-range')?.split('/')[1] ?? '0');
  if (total >= DAILY_CAP_PER_IP) return respond('RATE_LIMITED');

  const insertRes = await fetch(`${restUrl}/rest/v1/feedback`, {
    method: 'POST',
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_email: parsed.userEmail,
      type: parsed.type,
      message: trimmed,
      app_version: parsed.appVersion,
      device: parsed.device,
      os_version: parsed.osVersion,
      ip_hash: ipHash,
    }),
  });
  if (!insertRes.ok) return respond('FAILED', 502);

  return respond('OK');
});
