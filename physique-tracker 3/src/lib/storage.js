import { supabase, hasSupabase } from "./supabase";

// A tiny key/value store. When signed in to Supabase it syncs to the cloud
// (table `app_state`, scoped per user). Otherwise it falls back to this
// device's localStorage so the app works with zero backend setup.

let userId = null;
export function setUser(id) {
  userId = id || null;
}
export function cloudActive() {
  return Boolean(hasSupabase && userId);
}

export async function get(key) {
  if (cloudActive()) {
    const { data, error } = await supabase
      .from("app_state")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();
    if (error) return localGet(key); // fall back rather than lose data
    return data ? data.value : null;
  }
  return localGet(key);
}

export async function set(key, value) {
  if (cloudActive()) {
    const { error } = await supabase
      .from("app_state")
      .upsert({ user_id: userId, key, value }, { onConflict: "user_id,key" });
    if (!error) return;
  }
  localSet(key, value);
}

function localGet(key) {
  try {
    const raw = localStorage.getItem("pt:" + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function localSet(key, value) {
  try {
    localStorage.setItem("pt:" + key, JSON.stringify(value));
  } catch {}
}
