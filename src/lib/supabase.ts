import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

/** Cliente com service role: usar apenas em rotas de API (servidor). */
export function supabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas");
  cliente ??= createClient(url, chave, { auth: { persistSession: false } });
  return cliente;
}
