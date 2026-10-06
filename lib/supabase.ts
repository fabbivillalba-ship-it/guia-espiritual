import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

/**
 * Cliente de Supabase SOLO PARA EL SERVIDOR (rutas de API).
 * Usa la service role key, que se salta RLS: nunca la importes en componentes
 * de cliente ni la expongas con el prefijo NEXT_PUBLIC_.
 */
export function getSupabase(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno"
    );
  }

  cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
