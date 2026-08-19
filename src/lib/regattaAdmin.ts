import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Cliente server-only con `service_role` para el proyecto Supabase de
 * Regatta RC (`cpcjljvdhotrtlflbdbd`, SEPARADO del de Coach Data que usa
 * el resto de este sitio) — mismo patrón que `getSupabaseAdmin()` de
 * `apps/web` en Coach Data. Solo lo usa el webhook de Mercado Pago de
 * Regatta RC (`subscriptions` no tiene policy de INSERT/UPDATE para el
 * cliente ahí tampoco) — nunca importar desde código de cliente.
 *
 * Reusa `NEXT_PUBLIC_REGATTA_SUPABASE_URL` (ya cargada para
 * `src/lib/regatta.ts`) — solo hace falta agregar la service_role key.
 */
export function getRegattaAdmin(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_REGATTA_SUPABASE_URL
  const serviceRoleKey = process.env.REGATTA_CR_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Faltan NEXT_PUBLIC_REGATTA_SUPABASE_URL o REGATTA_CR_SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor')
  }

  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return client
}
