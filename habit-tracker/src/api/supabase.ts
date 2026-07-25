import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// null when env vars absent — callers must guard with `if (!supabase)`
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
      auth: {
        // A fresh Google token is required after each launch; never retain a
        // Supabase session on-device or refresh it in the background.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;
