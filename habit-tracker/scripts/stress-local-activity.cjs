// Local RPC contract test; this does not exercise native Google sign-in or app sync.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID, createHmac } = require('node:crypto');

const origin = 'http://127.0.0.1:54321';
const auth = 'supabase_auth_habi-staging-local-20260907-r4';
const config = JSON.parse(execFileSync('docker', ['inspect', auth], { encoding: 'utf8' }))[0];
const secret = config.Config.Env.find(e => e.startsWith('GOTRUE_JWT_SECRET='))?.slice('GOTRUE_JWT_SECRET='.length);
assert(secret, 'Local Auth signing secret unavailable');
const keyFor = role => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase', iat: now, exp: now + 3600 })}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
};
const anon = keyFor('anon');
const service = keyFor('service_role');
assert(anon && service, 'Local Kong credentials unavailable');
const email = `recovery-${randomUUID()}@example.com`;
const password = randomUUID();
let uid;
let token;
let calls = 0;
async function settledGroup(promises) {
  const results = await Promise.allSettled(promises);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map(result => result.value);
}
async function request(path, body, bearer = token, method = 'POST') {
  assert(path.startsWith('/auth/v1/') || path.startsWith('/rest/v1/'));
  const response = await fetch(origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { apikey: bearer === service ? service : anon, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  calls++;
  const data = await response.json();
  const reason = ['JWT expired', 'JWT issued at future', 'No suitable key', 'Invalid JWT', 'JWT not yet valid']
    .find(text => String(data.message ?? '').includes(text)) ?? 'see local server logs';
  if (!response.ok && reason === 'JWT issued at future') {
    const error = new Error('Local Auth/REST clock disagreement: JWT issued at future');
    error.code = 'LOCAL_CLOCK_SKEW';
    throw error;
  }
  assert(response.ok, `${method} ${path.split('?')[0]}: HTTP ${response.status}, code ${data.code ?? data.error_code ?? 'unknown'}, ${reason}`);
  return data;
}
async function main() {
  try {
    const user = await request('/auth/v1/admin/users', { email, password, email_confirm: true }, service);
    uid = user.id;
    assert(uid, 'Created user missing id');
    const session = await request('/auth/v1/token?grant_type=password', { email, password }, anon);
    token = session.access_token;
    assert(token, 'Local Auth session missing');
    // Probe a read before writes; bound retries for the observed local clock skew.
    for (let attempt = 0; ; attempt++) {
      try {
        await request('/rest/v1/activity_log?select=activity_key&limit=0', undefined, token, 'GET');
        break;
      } catch (error) {
        if (error.code !== 'LOCAL_CLOCK_SKEW' || attempt >= 10) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    console.log('PASS local Auth password sign-in (not app Google Auth)');
    for (let i = 0; i < 20; i++) {
      const key = randomUUID();
      const row = { activity_key: key, local_id: i + 1, task_type_id: null, kind: 'GOOD', duration_min: null, points_earned: 5, stars_delta: 2, source: 'TASK', logged_at: 1788825600000, local_date: '2026-09-08', week_start: '2026-09-07', note: 'isolated local contract fixture' };
      const append = () => request('/rest/v1/rpc/append_my_activity_rows', { p_activity_rows: [row] });
      const remove = () => request('/rest/v1/rpc/delete_my_activity_keys', { p_activity_keys: [key] });
      const read = () => request(`/rest/v1/activity_log?select=activity_key&activity_key=eq.${key}`, undefined, token, 'GET');
      const results = await settledGroup(Array.from({ length: 8 }, append));
      results.forEach(result => assert.equal(result[0]?.activity_key, key));
      assert.equal((await read()).length, 1, 'Concurrent append created duplicates');
      await settledGroup([remove(), remove(), remove()]);
      assert.equal((await read()).length, 0, 'Concurrent delete retained row');
      assert.equal((await remove())[0]?.activity_key, key, 'Delete retry not acknowledged');
      // The final delete models replay of the durable outbox after an in-flight append.
      await settledGroup([append(), remove()]);
      await remove();
      assert.equal((await read()).length, 0, 'Delete replay did not converge after append/delete race');
    }
    console.log('PASS 20 cycles: 8 concurrent appends, 3 concurrent deletes, delete retry, append/delete race with final delete replay, exact row counts');
  } finally {
    if (uid) {
      await request(`/auth/v1/admin/users/${uid}`, undefined, service, 'DELETE');
      console.log('PASS removed only the generated local Auth fixture');
    }
  }
  console.log(`Requests: ${calls}; harness uses no HEAD requests; app HEAD behavior is not tested here`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
