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

  if (!name) {
    return new Response(JSON.stringify({ translated: '' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // langpair: source|target — 'en|vi' or 'vi|en'
  // Auto-detect source by using 'autodetect' as source lang
  const langpair = `autodetect|${targetLanguage}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(name)}&langpair=${langpair}`;

  const res = await fetch(url);

  if (!res.ok) {
    return new Response(JSON.stringify({ translated: name }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const data = await res.json();
  // responseStatus 200 = success; fallback to original on any error
  const translated = (data?.responseStatus === 200
    ? (data?.responseData?.translatedText ?? name)
    : name
  ).trim();

  return new Response(JSON.stringify({ translated }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
