import { createClient } from '@supabase/supabase-js';

type RuntimeConfig = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

const runtimeConfig = typeof window !== 'undefined' ? window.__GB_POS_CONFIG__ : undefined;
const supabaseUrl = runtimeConfig?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = runtimeConfig?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment values. Check Railway variables or .env.local.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
