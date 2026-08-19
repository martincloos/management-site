import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Puente hacia el checkout que YA existe en producción para Coach Data
 * (`apps/web/src/app/api/checkout/mercadopago`, mismo Mercado Pago,
 * mismo webhook) — no se duplica esa lógica acá, solo se evita que el
 * usuario tenga que volver a tipear su email en otra pestaña estando ya
 * logueado en este sitio. Identidad resuelta por el propio token de
 * sesión (Coach Data es el proyecto de este sitio, sin puente de
 * identidad — a diferencia de Regatta RC).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.email) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const cycle = body?.cycle === 'annual' ? 'annual' : 'monthly'

  const coachDataWebUrl = process.env.NEXT_PUBLIC_COACH_DATA_WEB_URL ?? 'https://app.kalai.com.ar'
  const response = await fetch(`${coachDataWebUrl}/api/checkout/mercadopago`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: data.user.email, cycle }),
  })

  const result = await response.json().catch(() => ({ error: 'Respuesta inválida del checkout de Coach Data' }))
  return NextResponse.json(result, { status: response.status })
}
