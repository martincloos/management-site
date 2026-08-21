'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, kalai } from '@/lib/supabase'
import { regatta, ensureRegattaSession } from '@/lib/regatta'
import { eventBudgetUsd, eventDays, fetchOfficialArsRate, isEventFinished, type OfficialRate } from '@/lib/budget'
import { PRICES, PRODUCT_LABELS, type BillingCycle, type ProductId } from '@/lib/plans'

interface Organization {
  id: string
  name: string
  type: string
}

interface Membership {
  role: string
  organization_id: string
  organizations: Organization
}

interface PendingInvitation {
  id: string
  token: string
  role: string
  organizations: { name: string } | null
}

interface EventSummary {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  created_by: string
  hidden_by_founder: boolean
}

interface PendingEventInvitation {
  id: string
  token: string
  role: string
  events: { name: string } | null
}

interface SubscriptionRow {
  plan_type: string
  status: string
  expires_at: string | null
  trial_ends_at: string | null
}

// Misma lógica que apps/mobile/src/context/SubscriptionContext.tsx de
// Coach Data — no hay paquete compartido entre repos, se copia el
// cálculo (pequeño y estable) en vez de importar entre proyectos.
function isCurrentlyPro(row: SubscriptionRow | null): boolean {
  if (!row) return false
  const now = Date.now()
  if (row.status === 'active') return row.expires_at == null || new Date(row.expires_at).getTime() > now
  if (row.status === 'trialing') return row.trial_ends_at != null && new Date(row.trial_ends_at).getTime() > now
  return false
}

interface RegattaSubscriptionRow {
  status: string
  current_period_end: string | null
}

// `subscriptions` de Regatta RC tiene columnas distintas a las de Coach
// Data (`plan`/`current_period_end`, sin `trial_ends_at` — ver migración
// 002 de regatta-cr) y solo un estado "activo" posible, sin trial.
function isRegattaRcActive(row: RegattaSubscriptionRow | null): boolean {
  if (!row) return false
  return row.status === 'active' && (row.current_period_end == null || new Date(row.current_period_end).getTime() > Date.now())
}

const ORG_TYPES: Record<string, string> = {
  club: 'Club',
  federacion: 'Federación',
  asociacion: 'Asociación',
}

function extractInviteToken(input: string): string | null {
  const match = input.trim().match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
  return match ? match[0] : null
}

type GateState = 'loading' | 'signedOut' | 'ready'

export default function PersonalPage() {
  const router = useRouter()
  const [state, setState] = useState<GateState>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [regattaSubscription, setRegattaSubscription] = useState<RegattaSubscriptionRow | null>(null)
  const [regattaRcUnavailable, setRegattaRcUnavailable] = useState(false)
  const [addSubscriptionOpen, setAddSubscriptionOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductId | null>(null)
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('annual')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutSuccessBanner, setCheckoutSuccessBanner] = useState(false)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [myEvents, setMyEvents] = useState<EventSummary[]>([])
  const [pendingEventInvitations, setPendingEventInvitations] = useState<PendingEventInvitation[]>([])

  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('club')
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [eventName, setEventName] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')
  const [venueName, setVenueName] = useState('')
  const [venueAddress, setVenueAddress] = useState('')
  const [venueCity, setVenueCity] = useState('')
  const [venueCountry, setVenueCountry] = useState('')
  const [numClasses, setNumClasses] = useState('')
  const [expectedParticipants, setExpectedParticipants] = useState('')
  const [numRaceCourses, setNumRaceCourses] = useState('')
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [joinEventCode, setJoinEventCode] = useState('')
  const [arsRate, setArsRate] = useState<OfficialRate | null>(null)

  const loadPersonalData = useCallback(async (userId: string, email: string) => {
    const { data: subscriptionRow } = await supabase
      .from('subscriptions')
      .select('plan_type, status, expires_at, trial_ends_at')
      .eq('user_id', userId)
      .maybeSingle()
    setSubscription(subscriptionRow)

    // Proyecto Supabase separado (ver `src/lib/regatta.ts`) — si Regatta
    // RC está caído o el puente de identidad falla, no tiene que tirar
    // abajo el resto del hub personal, solo mostrar el estado como "no
    // disponible" en la tarjeta de Suscripciones.
    try {
      await ensureRegattaSession()
      const { data: regattaSubRow } = await regatta
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', userId)
        .maybeSingle()
      setRegattaSubscription(regattaSubRow)
      setRegattaRcUnavailable(false)
    } catch (err) {
      console.error('No se pudo cargar la suscripción de Regatta RC', err)
      setRegattaRcUnavailable(true)
    }

    const { data: membershipRows } = await kalai
      .from('organization_members')
      .select('role, organization_id, organizations(id, name, type)')
      .eq('user_id', userId)
    setMemberships((membershipRows ?? []) as unknown as Membership[])

    const { data: inviteRows } = await kalai
      .from('invitations')
      .select('id, token, role, organizations(name)')
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .is('event_id', null)
    setPendingInvitations((inviteRows ?? []) as unknown as PendingInvitation[])

    const { data: createdEvents } = await kalai
      .from('events')
      .select('id, name, start_date, end_date, created_by, hidden_by_founder')
      .eq('created_by', userId)
    const { data: memberEvents } = await kalai
      .from('event_memberships')
      .select('events(id, name, start_date, end_date, created_by, hidden_by_founder)')
      .eq('user_id', userId)
    const eventsById = new Map<string, EventSummary>()
    for (const ev of createdEvents ?? []) eventsById.set(ev.id, ev)
    for (const row of (memberEvents ?? []) as unknown as { events: EventSummary | null }[]) {
      if (row.events) eventsById.set(row.events.id, row.events)
    }
    setMyEvents(Array.from(eventsById.values()))

    const { data: eventInviteRows } = await kalai
      .from('invitations')
      .select('id, token, role, events(name)')
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .not('event_id', 'is', null)
    setPendingEventInvitations((eventInviteRows ?? []) as unknown as PendingEventInvitation[])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        setState('signedOut')
        return
      }
      const email = session.user.email ?? ''
      setUserId(session.user.id)
      setUserEmail(email)

      const { data: profile } = await supabase.from('profiles').select('name').eq('id', session.user.id).maybeSingle()
      setUserName(profile?.name ?? null)

      await loadPersonalData(session.user.id, email)
      setState('ready')

      // Mercado Pago vuelve acá después del pago (`back_url` de ambos
      // checkouts) — el webhook puede tardar unos segundos en llegar, así
      // que se muestra un aviso y se reintenta la carga una vez más en
      // vez de asumir que ya está confirmado.
      if (typeof window !== 'undefined' && window.location.search.includes('checkout=success')) {
        setCheckoutSuccessBanner(true)
        setTimeout(() => loadPersonalData(session.user.id, email), 4000)
      }
    })
  }, [router, loadPersonalData])

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProduct) return
    setCheckoutError(null)
    setCheckoutLoading(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setCheckoutLoading(false)
      setCheckoutError('Tu sesión expiró — recargá la página e intentá de nuevo.')
      return
    }

    const endpoint = selectedProduct === 'coachdata' ? '/api/checkout/coachdata' : '/api/checkout/regattarc'
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cycle: selectedCycle }),
      })
      const result = await response.json()
      if (!response.ok || !result.url) {
        setCheckoutError(result.error ?? 'No pudimos iniciar el pago. Probá de nuevo en unos minutos.')
        setCheckoutLoading(false)
        return
      }
      window.location.href = result.url
    } catch {
      setCheckoutError('No pudimos conectar con el checkout. Revisá tu conexión e intentá de nuevo.')
      setCheckoutLoading(false)
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setCreatingOrg(true)
    const { data, error } = await kalai.rpc('create_organization', { p_name: orgName, p_type: orgType })
    setCreatingOrg(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    if (data?.id) {
      router.push(`/organizaciones/${data.id}`)
    }
  }

  function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const token = extractInviteToken(joinCode)
    if (!token) {
      setErrorMsg('No pudimos reconocer ese código o link de invitación.')
      return
    }
    router.push(`/invite/${token}`)
  }

  useEffect(() => {
    if (showCreateEvent && !arsRate) {
      fetchOfficialArsRate().then(setArsRate)
    }
  }, [showCreateEvent, arsRate])

  const previewDays = eventDays(eventStart || null, eventEnd || null)
  const previewBudgetUsd = eventBudgetUsd(previewDays, Number(expectedParticipants) || 0, Number(numRaceCourses) || 0)

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setCreatingEvent(true)
    const { data, error } = await kalai.rpc('create_event', {
      p_name: eventName,
      p_description: eventDescription.trim() || null,
      p_start_date: eventStart || null,
      p_end_date: eventEnd || null,
      p_organization_id: null,
      p_venue_name: venueName.trim() || null,
      p_venue_address: venueAddress.trim() || null,
      p_venue_city: venueCity.trim() || null,
      p_venue_country: venueCountry.trim() || null,
      p_num_classes: numClasses ? Number(numClasses) : null,
      p_expected_participants: expectedParticipants ? Number(expectedParticipants) : null,
      p_num_race_courses: numRaceCourses ? Number(numRaceCourses) : null,
    })
    setCreatingEvent(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    if (data?.id) {
      router.push(`/eventos/${data.id}`)
    }
  }

  function handleJoinEventByCode(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const token = extractInviteToken(joinEventCode)
    if (!token) {
      setErrorMsg('No pudimos reconocer ese código o link de invitación.')
      return
    }
    router.push(`/invite/${token}`)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (state === 'loading' || state === 'signedOut') {
    return (
      <div className="page">
        <div className="subtitle">Cargando…</div>
      </div>
    )
  }

  const pro = isCurrentlyPro(subscription)
  const regattaRcPro = isRegattaRcActive(regattaSubscription)
  const proByProduct: Record<ProductId, boolean> = { coachdata: pro, regattarc: regattaRcPro }
  const addableProducts = (['coachdata', 'regattarc'] as ProductId[]).filter((p) => !proByProduct[p])

  function openAddSubscription() {
    setAddSubscriptionOpen((v) => !v)
    setSelectedProduct(null)
    setSelectedCycle('annual')
    setCheckoutError(null)
  }

  return (
    <div className="page">
      <div className="rowBetween">
        <div>
          <div className="title">Kalai Analytics</div>
          <div className="subtitle">Tu cuenta.</div>
        </div>
        <button className="button buttonSecondary" onClick={handleSignOut}>
          Cerrar sesión
        </button>
      </div>

      <div className="card">
        <div className="rowBetween">
          <div>
            <div className="sectionTitle">Información personal</div>
            <div style={{ fontSize: 16, marginTop: 4 }}>{userName || userEmail}</div>
            <div className="subtitle" style={{ marginTop: 2 }}>{userEmail}</div>
          </div>
          <Link className="link" href="/perfil">
            Editar
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="rowBetween">
          <div className="sectionTitle">Suscripciones</div>
          {addableProducts.length > 0 && (
            <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={openAddSubscription}>
              {addSubscriptionOpen ? 'Cancelar' : '+ Agregar'}
            </button>
          )}
        </div>

        <div className="memberRow">
          <span>Coach Data</span>
          <span className="badge">{pro ? 'Pro' : 'Gratis'}</span>
        </div>
        <div className="memberRow">
          <span>Regatta RC</span>
          <span className="badge">{regattaRcPro ? 'Pro' : regattaRcUnavailable ? 'No disponible' : 'Gratis'}</span>
        </div>

        {checkoutSuccessBanner && (
          <div className="success" style={{ marginTop: 8 }}>
            ¡Gracias! Estamos confirmando tu pago con Mercado Pago — puede tardar unos segundos en reflejarse acá.
          </div>
        )}

        {addSubscriptionOpen && !selectedProduct && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {addableProducts.map((productId) => (
              <button key={productId} type="button" className="button buttonSecondary" onClick={() => setSelectedProduct(productId)}>
                Agregar {PRODUCT_LABELS[productId]}
              </button>
            ))}
          </div>
        )}

        {addSubscriptionOpen && selectedProduct && (
          <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
            <div className="sectionTitle">{PRODUCT_LABELS[selectedProduct]} Pro</div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={selectedCycle === 'annual' ? 'button' : 'button buttonSecondary'}
                onClick={() => setSelectedCycle('annual')}
              >
                Anual
              </button>
              <button
                type="button"
                className={selectedCycle === 'monthly' ? 'button' : 'button buttonSecondary'}
                onClick={() => setSelectedCycle('monthly')}
              >
                Mensual
              </button>
            </div>

            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                ARS {PRICES[selectedProduct][selectedCycle].ars.toLocaleString('es-AR')}
                {selectedCycle === 'annual' ? '/año' : '/mes'}
              </div>
              <div className="subtitle">
                ≈ USD {PRICES[selectedProduct][selectedCycle].usd}
                {selectedCycle === 'annual' ? '/año' : '/mes'}
              </div>
              {selectedCycle === 'annual' && (
                <div className="subtitle" style={{ marginTop: 4 }}>
                  La mitad de precio de pagar 12 meses sueltos.
                </div>
              )}
            </div>

            {checkoutError && <div className="error">{checkoutError}</div>}

            <button className="button" type="submit" disabled={checkoutLoading}>
              {checkoutLoading ? 'Redirigiendo…' : 'Pagar con Mercado Pago'}
            </button>
            <button
              type="button"
              className="link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
              onClick={() => setSelectedProduct(null)}
            >
              Volver
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <div className="rowBetween">
          <div className="sectionTitle">Organizaciones</div>
          <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowCreateOrg((v) => !v)}>
            {showCreateOrg ? 'Cancelar' : '+ Crear'}
          </button>
        </div>

        {memberships.length > 0 ? (
          memberships.map((m) => (
            <Link key={m.organization_id} href={`/organizaciones/${m.organization_id}`} className="memberRow" style={{ cursor: 'pointer' }}>
              <span>{m.organizations.name}</span>
              <span className="badge">{ORG_TYPES[m.organizations.type] ?? m.organizations.type}</span>
            </Link>
          ))
        ) : (
          <div className="subtitle">Todavía no formás parte de ninguna organización.</div>
        )}

        {pendingInvitations.length > 0 && (
          <>
            <div className="sectionTitle" style={{ marginTop: 8 }}>
              Invitaciones pendientes
            </div>
            {pendingInvitations.map((inv) => (
              <Link key={inv.id} href={`/invite/${inv.token}`} className="memberRow" style={{ cursor: 'pointer' }}>
                <span>{inv.organizations?.name ?? 'Organización'}</span>
                <span className="link">Ver invitación</span>
              </Link>
            ))}
          </>
        )}

        {showCreateOrg && (
          <form onSubmit={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
            <div>
              <div className="label">Nombre</div>
              <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
            </div>
            <div>
              <div className="label">Tipo</div>
              <select className="select" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
                {Object.entries(ORG_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {errorMsg && <div className="error">{errorMsg}</div>}
            <button className="button" type="submit" disabled={creatingOrg}>
              {creatingOrg ? 'Creando…' : 'Crear organización'}
            </button>
          </form>
        )}

        <form onSubmit={handleJoinByCode} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            className="input"
            placeholder="Pegar código o link de invitación"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button className="button buttonSecondary" type="submit">
            Unirme
          </button>
        </form>
        {errorMsg && !showCreateOrg && <div className="error">{errorMsg}</div>}
      </div>

      <div className="card">
        <div className="rowBetween">
          <div className="sectionTitle">Eventos</div>
          <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowCreateEvent((v) => !v)}>
            {showCreateEvent ? 'Cancelar' : '+ Crear'}
          </button>
        </div>

        {(() => {
          const upcoming = myEvents.filter(
            (ev) =>
              !isEventFinished(ev.start_date, ev.end_date) && !(ev.created_by === userId && ev.hidden_by_founder),
          )
          const past = myEvents.filter((ev) => isEventFinished(ev.start_date, ev.end_date))
          return (
            <>
              {upcoming.length > 0 ? (
                upcoming.map((ev) => (
                  <Link key={ev.id} href={`/eventos/${ev.id}`} className="memberRow" style={{ cursor: 'pointer' }}>
                    <span>{ev.name}</span>
                    <span className="subtitle">{ev.start_date ?? ''}</span>
                  </Link>
                ))
              ) : (
                <div className="subtitle">Todavía no participás de ningún evento.</div>
              )}
              {past.length > 0 && (
                <>
                  <div className="sectionTitle" style={{ marginTop: 8 }}>
                    Eventos pasados
                  </div>
                  {past.map((ev) => (
                    <Link key={ev.id} href={`/eventos/${ev.id}`} className="memberRow" style={{ cursor: 'pointer' }}>
                      <span>{ev.name}</span>
                      <span className="subtitle">{ev.start_date ?? ''}</span>
                    </Link>
                  ))}
                </>
              )}
            </>
          )
        })()}

        {pendingEventInvitations.length > 0 && (
          <>
            <div className="sectionTitle" style={{ marginTop: 8 }}>
              Invitaciones pendientes
            </div>
            {pendingEventInvitations.map((inv) => (
              <Link key={inv.id} href={`/invite/${inv.token}`} className="memberRow" style={{ cursor: 'pointer' }}>
                <span>{inv.events?.name ?? 'Evento'}</span>
                <span className="link">Ver invitación</span>
              </Link>
            ))}
          </>
        )}

        {showCreateEvent && (
          <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
            <div>
              <div className="label">Nombre</div>
              <input className="input" value={eventName} onChange={(e) => setEventName(e.target.value)} required />
            </div>
            <div>
              <div className="label">Descripción</div>
              <input className="input" value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="label">Desde</div>
                <input className="input" type="date" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="label">Hasta</div>
                <input className="input" type="date" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
              </div>
            </div>

            <div className="sectionTitle">Sede</div>
            <div>
              <div className="label">Club / lugar</div>
              <input className="input" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
            </div>
            <div>
              <div className="label">Dirección</div>
              <input className="input" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="label">Ciudad</div>
                <input className="input" value={venueCity} onChange={(e) => setVenueCity(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="label">País</div>
                <input className="input" value={venueCountry} onChange={(e) => setVenueCountry(e.target.value)} />
              </div>
            </div>

            <div className="sectionTitle">Escala del evento</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="label">Clases</div>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={numClasses}
                  onChange={(e) => setNumClasses(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="label">Participantes estimados</div>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={expectedParticipants}
                  onChange={(e) => setExpectedParticipants(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="label">Canchas de regata</div>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={numRaceCourses}
                  onChange={(e) => setNumRaceCourses(e.target.value)}
                />
              </div>
            </div>

            {(expectedParticipants || numRaceCourses) && (
              <div style={{ background: 'var(--background)', borderRadius: 10, padding: 16, fontSize: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Presupuesto estimado</div>
                <div className="subtitle">
                  {previewDays} día{previewDays === 1 ? '' : 's'} · USD 0.3/participante/día + USD 5/cancha/día
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>
                  USD {previewBudgetUsd.toLocaleString('es-AR')}
                  {arsRate && (
                    <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>
                      {' '}
                      ≈ ARS {Math.round(previewBudgetUsd * arsRate.venta).toLocaleString('es-AR')} (tipo de cambio
                      oficial de hoy)
                    </span>
                  )}
                </div>
              </div>
            )}

            {errorMsg && <div className="error">{errorMsg}</div>}
            <button className="button" type="submit" disabled={creatingEvent}>
              {creatingEvent ? 'Creando…' : 'Crear evento'}
            </button>
          </form>
        )}

        <form onSubmit={handleJoinEventByCode} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            className="input"
            placeholder="Pegar código o link de invitación"
            value={joinEventCode}
            onChange={(e) => setJoinEventCode(e.target.value)}
          />
          <button className="button buttonSecondary" type="submit">
            Unirme
          </button>
        </form>
      </div>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Análisis</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">
          Vas a poder ver mapas y reportes de tus sesiones acá{!pro && ' — disponible solo con Coach Data Pro'}.
        </div>
      </div>
    </div>
  )
}
