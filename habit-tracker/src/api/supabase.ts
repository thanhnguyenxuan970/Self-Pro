import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  isQaSandboxNetworkBlocked,
  QaSandboxNetworkBlockedError,
} from '../qa/qaSandbox';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Supabase's SDK routes REST, Auth, RPC, and Edge Function calls through this
 * fetch implementation. Keeping the guard at the transport boundary means a
 * future QA-mode call site cannot accidentally leak fixture data remotely.
 */
export function createQaGuardedFetch(baseFetch: typeof fetch): typeof fetch {
  const guardedFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (isQaSandboxNetworkBlocked()) return Promise.reject(new QaSandboxNetworkBlockedError());
    return baseFetch(input, init);
  };
  return guardedFetch as typeof fetch;
}

// null when env vars absent — callers must guard with `if (!supabase)`
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
      global: {
        fetch: createQaGuardedFetch(globalThis.fetch.bind(globalThis)),
      },
      auth: {
        // A fresh Google token is required after each launch; never retain a
        // Supabase session on-device or refresh it in the background.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;
