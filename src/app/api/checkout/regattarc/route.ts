import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { PRICES, MERCADOPAGO_FREQUENCY, type BillingCycle } from '@/lib/plans'

/**
 * A diferencia de Coach Data (mismo proyecto que este sitio), Regatta RC
 * es un proyecto Supabase separado — el checkout arma la preapproval de
 * Mercado Pago directo acá (mismo Access Token/cuenta que ya usa Coach
 * Data, decisión del usuario 2026-08-19), pero necesita garantizar ANTES
 * que este uuid ya existe como `auth.users` en el proyecto de Regatta RC
 * — si no, el UPDATE del webhook falla contra la FK de `subscriptions`.
 * Reusa el mismo puente de identidad que ya prueban `race-committee`/
 * `admin`/`RaceCoursesSection` (`exchange-kalai-session`), invocado
 * server-side (no client-side como `ensureRegattaSession`) porque el
 * webhook es asíncrono y no tiene el token del usuario a mano — esta es
 * la única oportunidad de dispararlo con el token todavía vivo.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.id || !data.user.email) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }
  const userId = data.user.id
  const email = data.user.email

  const regattaUrl = process.env.NEXT_PUBLIC_REGATTA_SUPABASE_URL
  if (!regattaUrl) {
    return NextResponse.json({ error: 'Regatta RC no configurado todavía' }, { status: 503 })
  }
  const exchangeRes = await fetch(`${regattaUrl}/functions/v1/exchange-kalai-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!exchangeRes.ok) {
    const detail = await exchangeRes.json().catch(() => ({}))
    console.error('exchange-kalai-session falló antes del checkout de Regatta RC', userId, detail)
    return NextResponse.json({ error: detail?.error ?? 'No se pudo preparar tu cuenta en Regatta RC' }, { status: 502 })
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://analytics.kalai.com.ar'
  if (!accessToken) {
    return NextResponse.json({ error: 'Checkout de Mercado Pago no configurado todavía' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const cycle: BillingCycle = body?.cycle === 'annual' ? 'annual' : 'monthly'
  const price = PRICES.regattarc[cycle].ars
  const frequency = MERCADOPAGO_FREQUENCY[cycle]

  const response = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: cycle === 'annual' ? 'Regatta RC Pro — anual' : 'Regatta RC Pro — mensual',
      external_reference: userId,
      payer_email: email,
      back_url: `${siteUrl}/?checkout=success`,
      auto_recurring: {
        frequency: frequency.frequency,
        frequency_type: frequency.frequency_type,
        transaction_amount: price,
        currency_id: 'ARS',
      },
      status: 'pending',
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('Mercado Pago preapproval error (Regatta RC)', response.status, detail)
    return NextResponse.json({ error: 'No pudimos iniciar el pago con Mercado Pago' }, { status: 502 })
  }

  const result = await response.json()
  return NextResponse.json({ url: result.init_point as string })
}
