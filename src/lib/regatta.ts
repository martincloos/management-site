import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Proyecto Supabase SEPARADO de Regatta CR — solo para "Canchas de
// regata" del dashboard de evento. Nunca comparte tablas con kalai (ver
// docs/INTEGRATION.md de regatta-cr); la única superficie de contacto es
// el puente de identidad `exchange-kalai-session` + el RPC
// `sync_kalai_event` (migración 020 de regatta-cr).
const regattaUrl = process.env.NEXT_PUBLIC_REGATTA_SUPABASE_URL!
const regattaAnonKey = process.env.NEXT_PUBLIC_REGATTA_SUPABASE_ANON_KEY!

export const regatta = createClient(regattaUrl, regattaAnonKey)

const EXCHANGE_TIMEOUT_MS = 12000

/**
 * Arma una sesión real de Regatta CR a partir de la sesión de Kalai core
 * ya activa acá — mismo mecanismo que ya usan apps/admin y
 * apps/race-committee de regatta-cr (reimplementado acá porque
 * `@regatta-cr/shared` es un paquete de workspace de ESE monorepo, no
 * publicado, no se puede importar entre repos distintos). Idempotente:
 * si ya hay una sesión de Regatta CR viva, no vuelve a canjear.
 */
export async function ensureRegattaSession(): Promise<void> {
  const { data: existing } = await regatta.auth.getSession()
  if (existing.session) return

  const { data: kalaiSession } = await supabase.auth.getSession()
  const accessToken = kalaiSession.session?.access_token
  if (!accessToken) throw new Error('No hay sesión de Kalai activa')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${regattaUrl}/functions/v1/exchange-kalai-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
  } catch {
    throw new Error('No se pudo conectar con Regatta CR. Revisá tu conexión e intentá de nuevo.')
  } finally {
    clearTimeout(timeoutId)
  }

  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.error ?? 'No se pudo canjear la sesión de Kalai')
  }

  const { error } = await regatta.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  })
  if (error) throw error
}
