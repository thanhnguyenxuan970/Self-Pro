// Supabase Edge Function: translate activity name via MyMemory (free, no API key).
//
// No secrets required.
// Free tier: 1000 words/day (no key) — enough for habit tracker activity names.
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

  if (!['vi', 'en'].includes(targetLanguage)) {
    return new Response(JSON.stringify({ error: 'invalid targetLanguage' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!name) {
    return new Response(JSON.stringify({ translated: '' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const langpair = `autodetect|${encodeURIComponent(targetLanguage)}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(name)}&langpair=${langpair}`;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 4000);
  const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    return new Response(JSON.stringify({ translated: name }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return new Response(JSON.stringify({ translated: name }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  type MMResponse = { responseStatus?: number; responseData?: { translatedText?: string } };
  const d = data as MMResponse;
  // responseStatus 200 = success; fallback to original on any error
  const translated = (d?.responseStatus === 200 ? (d?.responseData?.translatedText ?? name) : name).trim();

  return new Response(JSON.stringify({ translated }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
