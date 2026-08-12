import { createClient } from '@supabase/supabase-js';

function readRuntimeConfig() {
  return typeof window !== 'undefined' ? window.__GB_POS_CONFIG__ : undefined;
}

export function getSupabaseRuntimeConfig() {
  const runtime = readRuntimeConfig();
  const supabaseUrl = runtime?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
  const supabasePublishableKey = runtime?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  return { supabaseUrl, supabasePublishableKey };
}

const { supabaseUrl, supabasePublishableKey } = getSupabaseRuntimeConfig();

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment values. Check .env.local.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);