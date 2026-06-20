// Supabase Edge Function: translate activity name via Claude Haiku.
//
// Secrets required (Dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY — from console.anthropic.com
//
// Deploy: supabase functions deploy translate-name --no-verify-jwt
//
// Request body: { name: string, targetLanguage: 'vi' | 'en' }
// Response:     { translated: string }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'missing api key' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let name: string;
  let targetLanguage: string;
  try {
    const body = await req.json();
    name = String(body.name ?? '').trim();
    targetLanguage = String(body.targetLanguage ?? 'vi');
  } catch {
    return new Response(JSON.stringify({ error: 'invalid body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!name) {
    return new Response(JSON.stringify({ translated: '' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const langLabel = targetLanguage === 'en' ? 'English' : 'Vietnamese';
  const prompt = `Translate this habit/activity name to ${langLabel}. Reply with ONLY the translated name, nothing else, no quotes, no punctuation added: ${name}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ translated: name }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const data = await res.json();
  const translated = (data?.content?.[0]?.text ?? name).trim();

  return new Response(JSON.stringify({ translated }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
