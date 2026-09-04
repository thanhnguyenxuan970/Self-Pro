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
// Request body:  { type, message, userEmail, appVersion, platform, device,
// osVersion, deviceTimezone, deviceLocale, appLanguage, localDate, screen,
// route, errorCode, errorNotice, answers }
// Response body: { result: 'OK' | 'INVALID' | 'RATE_LIMITED' | 'FAILED' }
// (always HTTP 200 for expected outcomes; non-200 only for genuine
// misconfiguration/transport failure, which the client treats as FAILED)
//
// `answers` (migration 044) carries the D0 growth survey's structured MCQ
// responses as JSON — only type SURVEY_D0 populates it today, but the field
// is accepted for any type since a future survey may reuse it. It must stay
// whitelisted here explicitly: this table has no client INSERT grant
// (migration 034), so an unlisted field doesn't error, it just silently
// never reaches the row.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

const COOLDOWN_SECONDS = 60; // mirrors FEEDBACK_COOLDOWN_MS in src/utils/feedbackLogic.ts
const DAILY_CAP_PER_IP = 20; // guards the shared Resend 100/day quota against slow-drip abuse
const MIN_LENGTH = 3; // mirrors FEEDBACK_MIN_LENGTH
const MAX_LENGTH = 2000; // mirrors FEEDBACK_MAX_LENGTH
const VALID_TYPES = ['BUG', 'SUGGESTION', 'OTHER', 'SURVEY_D0'];
const SURVEY_TYPE = 'SURVEY_D0';

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
  platform: string | null;
  device: string | null;
  osVersion: string | null;
  deviceTimezone: string | null;
  deviceLocale: string | null;
  appLanguage: string | null;
  localDate: string | null;
  screen: string | null;
  route: string | null;
  errorCode: string | null;
  errorNotice: string | null;
  answers: Record<string, unknown> | null;
};

function textField(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const valueTrimmed = value.trim();
  return valueTrimmed ? valueTrimmed.slice(0, maxLength) : null;
}

function enumField(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null;
}

async function parseBody(req: Request): Promise<ParsedBody | null> {
  try {
    const body = await req.json();
    if (typeof body.message !== 'string' || typeof body.type !== 'string') return null;
    return {
      type: body.type,
      message: body.message,
      userEmail: typeof body.userEmail === 'string' ? body.userEmail : null,
      appVersion: textField(body.appVersion, 32),
      platform: enumField(body.platform, ['android', 'ios', 'web']),
      device: textField(body.device, 128),
      osVersion: textField(body.osVersion, 64),
      deviceTimezone: textField(body.deviceTimezone, 64),
      deviceLocale: textField(body.deviceLocale, 64),
      appLanguage: enumField(body.appLanguage, ['vi', 'en']),
      localDate: typeof body.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.localDate) ? body.localDate : null,
      screen: textField(body.screen, 128),
      route: textField(body.route, 128),
      errorCode: textField(body.errorCode, 64),
      errorNotice: textField(body.errorNotice, 256),
      answers: (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers))
        ? body.answers as Record<string, unknown>
        : null,
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

  if (!VALID_TYPES.includes(parsed.type)) return respond('INVALID');

  const trimmed = parsed.message.trim();
  // SURVEY_D0's Q6 (free text) is optional — an empty message is only valid
  // for this type; a non-empty one still has to clear the normal bound.
  const messageOk = parsed.type === SURVEY_TYPE && trimmed.length === 0
    ? true
    : trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH;
  if (!messageOk) return respond('INVALID');

  const ipHash = await hashIp(clientIp(req));
  const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // Per-IP cooldown: any non-survey row for this ip_hash in the last
  // COOLDOWN_SECONDS. SURVEY_D0 is exempt in both directions — the survey
  // itself is never blocked by a recent submission, and a prior survey row
  // never blocks a real bug/suggestion sent moments later (see
  // canSubmitFeedback in src/utils/feedbackLogic.ts for the client-side half).
  if (parsed.type !== SURVEY_TYPE) {
    const cooldownSince = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();
    const cooldownRes = await fetch(
      `${restUrl}/rest/v1/feedback?select=id&ip_hash=eq.${ipHash}&created_at=gte.${cooldownSince}&type=neq.${SURVEY_TYPE}&limit=1`,
      { headers: restHeaders },
    );
    if (!cooldownRes.ok) return respond('FAILED', 502);
    if ((await cooldownRes.json()).length > 0) return respond('RATE_LIMITED');
  }

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
      platform: parsed.platform,
      device: parsed.device,
      os_version: parsed.osVersion,
      device_timezone: parsed.deviceTimezone,
      device_locale: parsed.deviceLocale,
      app_language: parsed.appLanguage,
      local_date: parsed.localDate,
      screen: parsed.screen,
      route: parsed.route,
      error_code: parsed.errorCode,
      error_notice: parsed.errorNotice,
      ip_hash: ipHash,
      answers: parsed.answers,
    }),
  });
  if (!insertRes.ok) return respond('FAILED', 502);

  return respond('OK');
});
