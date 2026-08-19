import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getRegattaAdmin } from '@/lib/regattaAdmin'

/**
 * Mismo algoritmo de firma que ya funciona en producción para el webhook
 * de Coach Data (`apps/web/src/app/api/webhooks/mercadopago`) — ver ese
 * archivo para el detalle del manifest. Secreto PROPIO
 * (`MERCADOPAGO_REGATTARC_WEBHOOK_SECRET`): esta es una URL de webhook
 * distinta, Mercado Pago entrega una firma secreta por URL registrada,
 * no reusar la de Coach Data.
 */
function isValidSignature(req: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_REGATTARC_WEBHOOK_SECRET
  if (!secret) return false

  const signatureHeader = req.headers.get('x-signature')
  const requestId = req.headers.get('x-request-id')
  if (!signatureHeader || !requestId) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=').map((s) => s.trim())
      return [key, value]
    })
  )
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')

  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf = Buffer.from(v1, 'hex')
  if (expectedBuf.length !== actualBuf.length) return false
  return timingSafeEqual(expectedBuf, actualBuf)
}

// `subscriptions.status` de Regatta RC solo admite
// active/inactive/expired (migración 002 de regatta-cr) — sin
// 'cancelled' propio como Coach Data, 'inactive' es el equivalente más
// cercano. No cambia el control de acceso real: `has_active_subscription`
// solo mira `status = 'active'`.
function mapStatus(mpStatus: string): 'active' | 'inactive' | 'expired' {
  switch (mpStatus) {
    case 'authorized':
      return 'active'
    case 'cancelled':
      return 'inactive'
    case 'paused':
    case 'pending':
    default:
      return 'expired'
  }
}

export async function POST(req: NextRequest) {
  const dataId = req.nextUrl.searchParams.get('data.id') ?? req.nextUrl.searchParams.get('id')
  const type = req.nextUrl.searchParams.get('type') ?? req.nextUrl.searchParams.get('topic')

  if (!dataId || type !== 'subscription_preapproval') {
    return NextResponse.json({ ok: true })
  }

  if (!isValidSignature(req, dataId)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json({ error: 'Mercado Pago no configurado' }, { status: 503 })
  }

  const response = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    console.error('No se pudo leer el preapproval (Regatta RC)', dataId, response.status)
    return NextResponse.json({ error: 'No se pudo leer la suscripción' }, { status: 502 })
  }

  const preapproval = await response.json()
  const userId: string | undefined = preapproval.external_reference
  if (!userId) {
    console.error('Preapproval de Regatta RC sin external_reference', dataId)
    return NextResponse.json({ ok: true })
  }

  const { error } = await getRegattaAdmin()
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan: 'personal',
        status: mapStatus(preapproval.status),
        current_period_end: preapproval.next_payment_date ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error(`No se pudo actualizar subscriptions de Regatta RC para user_id=${userId}`, error.message)
    return NextResponse.json({ error: 'No se pudo actualizar la suscripción' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
