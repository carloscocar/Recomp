import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If env vars aren't set, the app runs in local-only mode (no login, device-local data).
export const hasSupabase = Boolean(url && anon);
export const supabase = hasSupabase ? createClient(url, anon) : null;
