'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, kalai } from '@/lib/supabase'

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
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
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
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [joinEventCode, setJoinEventCode] = useState('')

  const loadPersonalData = useCallback(async (userId: string, email: string) => {
    const { data: subscriptionRow } = await supabase
      .from('subscriptions')
      .select('plan_type, status, expires_at, trial_ends_at')
      .eq('user_id', userId)
      .maybeSingle()
    setSubscription(subscriptionRow)

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
      .select('id, name, start_date, end_date')
      .eq('created_by', userId)
    const { data: memberEvents } = await kalai
      .from('event_memberships')
      .select('events(id, name, start_date, end_date)')
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
      setUserEmail(email)

      const { data: profile } = await supabase.from('profiles').select('name').eq('id', session.user.id).maybeSingle()
      setUserName(profile?.name ?? null)

      await loadPersonalData(session.user.id, email)
      setState('ready')
    })
  }, [router, loadPersonalData])

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
        <div className="sectionTitle">Suscripciones</div>
        <div className="memberRow">
          <span>Coach Data</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="badge">{pro ? 'Pro' : 'Gratis'}</span>
            {!pro && (
              <a className="link" href="https://kalai.com.ar/pro" target="_blank" rel="noopener noreferrer">
                Adquirir
              </a>
            )}
          </div>
        </div>
        <div className="memberRow" style={{ opacity: 0.5 }}>
          <span>Regatta RC</span>
          <span className="badge">Próximamente</span>
        </div>
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

        {myEvents.length > 0 ? (
          myEvents.map((ev) => (
            <Link key={ev.id} href={`/eventos/${ev.id}`} className="memberRow" style={{ cursor: 'pointer' }}>
              <span>{ev.name}</span>
              <span className="subtitle">{ev.start_date ?? ''}</span>
            </Link>
          ))
        ) : (
          <div className="subtitle">Todavía no participás de ningún evento.</div>
        )}

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
