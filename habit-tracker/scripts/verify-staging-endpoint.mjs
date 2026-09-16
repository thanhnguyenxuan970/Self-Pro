const productionHost = 'ebprkyplvqexzpwfasjq.supabase.co';
const target = process.env.HABI_BUILD_TARGET ?? '';
const rawEndpoint = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

function fail(message) {
  console.error(`STAGING_ENDPOINT_BLOCKED|${message}`);
  process.exit(1);
}

if (target !== 'staging') {
  fail('HABI_BUILD_TARGET must be staging');
}

if (!rawEndpoint.trim()) {
  fail('EXPO_PUBLIC_SUPABASE_URL is missing');
}

let endpoint;
try {
  endpoint = new URL(rawEndpoint);
} catch {
  fail('EXPO_PUBLIC_SUPABASE_URL is not a valid URL');
}

if (!['http:', 'https:'].includes(endpoint.protocol) || !endpoint.hostname) {
  fail('EXPO_PUBLIC_SUPABASE_URL must include a supported protocol and host');
}

if (endpoint.hostname.toLowerCase() === productionHost) {
  fail('the Self-Pro production host is not allowed for a staging build');
}

console.log(`STAGING_ENDPOINT_OK|${endpoint.origin}`);
