// Presupuesto de evento — misma fórmula que kalai.event_budget_usd() en
// la base (migración 026), duplicada acá porque el preview de "Crear
// evento" corre antes de que el evento exista (no hay id para llamar al
// RPC todavía). USD 0.3 por participante por día + USD 5 por cancha por
// día. Se paga en pesos al tipo de cambio oficial del día del pago — no
// se fija un tipo de cambio al crear el evento, se consulta en vivo.
export function eventDays(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate) return 1
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : start
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  return Math.max(1, diffDays)
}

export function eventBudgetUsd(days: number, participants: number, courses: number): number {
  return Math.round((participants * 0.3 + courses * 5) * days * 100) / 100
}

export interface OfficialRate {
  venta: number
  compra: number
  fecha: string | null
}

// dolarapi.com — API pública argentina, sin auth, usada como fuente del
// "tipo de cambio oficial" para mostrar el equivalente en pesos. Si falla
// (red, CORS, API caída), se degrada mostrando solo el monto en USD.
export async function fetchOfficialArsRate(): Promise<OfficialRate | null> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial')
    if (!res.ok) return null
    const data = await res.json()
    if (typeof data.venta !== 'number') return null
    return { venta: data.venta, compra: data.compra ?? null, fecha: data.fechaActualizacion ?? null }
  } catch {
    return null
  }
}

// Días entre hoy y una fecha (positivo = en el futuro). null si no hay fecha.
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const target = new Date(`${dateStr}T00:00:00`)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export const PAYMENT_WARNING_DAYS = 20
export const PAYMENT_LOCK_DAYS = 10

// Mismo criterio que kalai.is_event_finished(): termina en end_date, o en
// start_date si no hay fecha de fin cargada.
export function isEventFinished(startDate: string | null | undefined, endDate: string | null | undefined): boolean {
  const d = endDate ?? startDate
  if (!d) return false
  return d < new Date().toISOString().slice(0, 10)
}
