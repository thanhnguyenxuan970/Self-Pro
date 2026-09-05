test('creates the guarded Supabase client when production configuration is present', () => {
  const createClient = jest.fn((url: string, key: string, options: { global: { fetch: typeof fetch } }) => ({ url, key, options }));
  const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  jest.resetModules();
  jest.doMock('@supabase/supabase-js', () => ({ createClient }));
  jest.doMock('../src/qa/qaSandbox', () => ({
    isQaSandboxNetworkBlocked: jest.fn(() => false),
    QaSandboxNetworkBlockedError: class QaSandboxNetworkBlockedError extends Error {},
  }));
  try {
    let configured: { supabase: unknown } | undefined;
    jest.isolateModules(() => {
      configured = require('../src/api/supabase') as { supabase: unknown };
    });
    expect(configured?.supabase).toEqual(expect.objectContaining({ url: 'https://example.supabase.co', key: 'anon-key' }));
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }) }),
    );
  } finally {
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previousKey;
    jest.dontMock('@supabase/supabase-js');
    jest.dontMock('../src/qa/qaSandbox');
    jest.resetModules();
  }
});
