import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export const supabase = (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

export const supabaseStorageBucket = env.SUPABASE_STORAGE_BUCKET || '';

export function isSupabaseEnabled() {
  return !!supabase;
}

export function isSupabaseStorageEnabled() {
  return !!supabase && !!supabaseStorageBucket;
}
