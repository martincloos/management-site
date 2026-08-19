import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Proyecto Supabase SEPARADO de Regatta CR — solo para "Canchas de
// regata" del dashboard de evento. Nunca comparte tablas con kalai (ver
// docs/INTEGRATION.md de regatta-cr); la única superficie de contacto es
// el puente de identidad `exchange-kalai-session` + el RPC
// `sync_kalai_event` (migración 020 de regatta-cr).
//
// El cliente se crea LAZY (recién en el primer uso real, nunca al
// importar el módulo) — bug real encontrado 2026-08-19: como `regatta`
// se creaba a nivel de módulo con `createClient(url!, key!)`, faltar
// esas env vars en Vercel rompía el prerender de `/` ENTERO (build
// error), aunque esa página ni siquiera llegara a usar Regatta RC
// todavía. Ahora, sin las env vars, solo falla cuando de verdad se
// intenta usar (dentro de `ensureRegattaSession`, ya manejado con
// try/catch en los callers).
function regattaUrl(): string {
  const url = process.env.NEXT_PUBLIC_REGATTA_SUPABASE_URL
  if (!url) throw new Error('Falta NEXT_PUBLIC_REGATTA_SUPABASE_URL')
  return url
}

let _client: SupabaseClient | null = null
function getClient(): SupabaseClient {
  if (_client) return _client
  const anonKey = process.env.NEXT_PUBLIC_REGATTA_SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('Falta NEXT_PUBLIC_REGATTA_SUPABASE_ANON_KEY')
  _client = createClient(regattaUrl(), anonKey)
  return _client
}

// Proxy en vez de una instancia directa: cualquier acceso a una
// propiedad/método (`.from`, `.auth`, `.rpc`, …) dispara `getClient()`
// recién ahí, no al importar `regatta.ts`.
export const regatta: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver)
  },
})

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
    res = await fetch(`${regattaUrl()}/functions/v1/exchange-kalai-session`, {
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
