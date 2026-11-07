import { createClient } from "@supabase/supabase-js";

// Both values are public by design: data is protected by row level security in the database.
const url = import.meta.env.VITE_SUPABASE_URL || "https://jsxysokftxidqxhqbjyh.supabase.co";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_qaByi9wbx_WYcXPGucj4VQ_6uIcHNgv";

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
