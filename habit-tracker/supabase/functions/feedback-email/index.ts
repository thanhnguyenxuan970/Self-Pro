// Supabase Edge Function: email notification on new feedback (via Resend).
//
// Triggered by a Database Webhook (INSERT on public.feedback).
// Secrets required (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY          — from resend.com (free tier: 100 emails/day)
//   FEEDBACK_NOTIFY_EMAIL   — your inbox, e.g. thanhnguyenxuan970@gmail.com
//   FEEDBACK_WEBHOOK_SECRET — random string; must match the webhook header
//
// Deploy:  supabase functions deploy feedback-email --no-verify-jwt
// Webhook: Dashboard → Database → Webhooks → Create:
//   table=feedback, events=INSERT, type=HTTP request,
//   URL=https://<project-ref>.functions.supabase.co/feedback-email
//   HTTP header: x-webhook-secret: <FEEDBACK_WEBHOOK_SECRET>

Deno.serve(async (req: Request): Promise<Response> => {
  const secret = Deno.env.get('FEEDBACK_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  let record: Record<string, unknown>;
  try {
    const payload = await req.json();
    record = payload.record ?? {};
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('FEEDBACK_NOTIFY_EMAIL');
  if (!apiKey || !to) return new Response('not configured', { status: 500 });

  const esc = (v: unknown) =>
    String(v ?? '—').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Habit Ring <onboarding@resend.dev>',
      to: [to],
      subject: `[Habit Ring] ${esc(record.type)} feedback #${esc(record.id)}`,
      html: `
        <h3>New ${esc(record.type)} feedback</h3>
        <p style="white-space:pre-wrap">${esc(record.message)}</p>
        <hr>
        <small>
          From: ${esc(record.user_email)}<br>
          App: v${esc(record.app_version)} · ${esc(record.device)} · Android ${esc(record.os_version)}<br>
          At: ${esc(record.created_at)}
        </small>`,
    }),
  });

  return new Response(res.ok ? 'ok' : 'resend error', { status: res.ok ? 200 : 502 });
});
