import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = import.meta.env["VITE_SUPABASE_URL"];
const publishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
if (!url || !publishableKey) {
  const missing = [
    !url && "VITE_SUPABASE_URL",
    !publishableKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean);
  throw new Error(
    `Missing required frontend environment variable(s): ${missing.join(", ")}. Set them in .env.local or your static host configuration.`,
  );
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
