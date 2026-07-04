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

type ParsedBody = { name: string; targetLanguage: string };

async function parseRequestBody(req: Request): Promise<ParsedBody | Response> {
  try {
    const body = await req.json();
    const name = String(body.name ?? '').trim();
    const targetLanguage = String(body.targetLanguage ?? 'vi');
    return { name, targetLanguage };
  } catch {
    return new Response(JSON.stringify({ error: 'invalid body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

type MMResponse = { responseStatus?: number; responseData?: { translatedText?: string } };

async function translateText(name: string, targetLanguage: string): Promise<string> {
  const langpair = `autodetect|${encodeURIComponent(targetLanguage)}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(name)}&langpair=${langpair}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 4000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch {
    clearTimeout(timeout);
    return name;
  }
  clearTimeout(timeout);
  if (!res.ok) return name;
  try {
    const d = await res.json() as MMResponse;
    return (d?.responseStatus === 200 ? (d?.responseData?.translatedText ?? name) : name).trim();
  } catch {
    return name;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const parsed = await parseRequestBody(req);
  if (parsed instanceof Response) return parsed;

  const { name, targetLanguage } = parsed;

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

  const translated = await translateText(name, targetLanguage);

  return new Response(JSON.stringify({ translated }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
