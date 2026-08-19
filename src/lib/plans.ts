export type BillingCycle = 'monthly' | 'annual'
export type ProductId = 'coachdata' | 'regattarc'

export const PRODUCT_LABELS: Record<ProductId, string> = {
  coachdata: 'Coach Data',
  regattarc: 'Regatta RC',
}

// Coach Data: cerrado 2026-08-13 (~2 meses gratis en el anual). Regatta
// RC: cerrado 2026-08-19, a propósito la mitad de precio en el anual (no
// solo unos meses gratis) — empuja fuerte hacia el anual.
export const PRICES: Record<ProductId, Record<BillingCycle, { ars: number; usd: number }>> = {
  coachdata: {
    monthly: { ars: 3000, usd: 2 },
    annual: { ars: 30000, usd: 20 },
  },
  regattarc: {
    monthly: { ars: 7500, usd: 5 },
    annual: { ars: 45000, usd: 30 },
  },
}

export const MERCADOPAGO_FREQUENCY: Record<BillingCycle, { frequency: number; frequency_type: 'months' }> = {
  monthly: { frequency: 1, frequency_type: 'months' },
  annual: { frequency: 12, frequency_type: 'months' },
}
