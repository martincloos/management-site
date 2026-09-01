'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, kalai } from '@/lib/supabase'
import { EVENT_ROLE_LABELS, EVENT_INVITABLE_ROLES } from '@/lib/roles'
import {
  daysUntil,
  eventBudgetUsd,
  eventDays,
  fetchOfficialArsRate,
  isEventFinished,
  PAYMENT_LOCK_DAYS,
  PAYMENT_WARNING_DAYS,
  type OfficialRate,
} from '@/lib/budget'
import RosterSection from '@/components/RosterSection'
import RaceCoursesSection from '@/components/RaceCoursesSection'
import { VentanasSection } from 'kalai-checkin/staff'

interface EventRow {
  id: string
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
  organization_id: string | null
  created_by: string
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_country: string | null
  num_classes: number | null
  expected_participants: number | null
  num_race_courses: number | null
  paid: boolean
  hidden_by_founder: boolean
  organizations: { name: string } | null
}

const PARTICIPANT_FIELDS = [
  { key: 'full_name', label: 'Nombre completo', required: true },
  { key: 'class', label: 'Clase' },
  { key: 'club', label: 'Club' },
  { key: 'sail_number', label: 'Vela' },
  { key: 'dni', label: 'DNI' },
  { key: 'birth_date', label: 'Fecha de nacimiento', type: 'date' as const },
  { key: 'nationality', label: 'Nacionalidad' },
  { key: 'fleet', label: 'Flota / color' },
  { key: 'boat_group', label: 'Grupo de embarcación' },
  { key: 'crew_role', label: 'Rol (timonel/tripulante)' },
  { key: 'notes', label: 'Notas' },
]

const PARTICIPANT_ALIASES: Record<string, string[]> = {
  full_name: ['timonel', 'nombre', 'apellido y nombre', 'nombre completo', 'navegante'],
  class: ['clase', 'class'],
  club: ['club'],
  sail_number: ['vela', 'nº vela', 'numero de vela', 'sail'],
  dni: ['dni', 'documento'],
  birth_date: ['nac', 'nacimiento', 'fecha de nacimiento', 'fecha nacimiento'],
  nationality: ['pais', 'país', 'nacionalidad'],
  fleet: ['flotad1', 'flota', 'color', 'grupo'],
  boat_group: ['boat_id', 'embarcacion', 'bote'],
  crew_role: ['rol', 'timonel/tripulante'],
  notes: ['notas', 'observaciones'],
}

const COACH_FIELDS = [
  { key: 'full_name', label: 'Nombre completo', required: true },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'club', label: 'Club' },
  { key: 'classes', label: 'Clases a cargo' },
  { key: 'medical_note', label: 'Ficha médica' },
  { key: 'notes', label: 'Notas' },
]

const COACH_ALIASES: Record<string, string[]> = {
  full_name: ['nombre', 'apellido y nombre', 'nombre completo', 'entrenador'],
  email: ['email', 'mail', 'correo'],
  phone: ['telefono', 'teléfono', 'celular'],
  club: ['club'],
  classes: ['clase', 'clases', 'class'],
  medical_note: ['ficha medica', 'ficha médica'],
  notes: ['notas', 'observaciones'],
}

interface MemberRow {
  role: string
  user_id: string
  email: string
}

interface InvitationRow {
  id: string
  email: string
  role: string
  token: string
}

type GateState = 'loading' | 'signedOut' | 'notFound' | 'ready'

export default function EventPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<GateState>('loading')
  const [userId, setUserId] = useState<string | null>(null)

  const [event, setEvent] = useState<EventRow | null>(null)
  const [founderEmail, setFounderEmail] = useState('')
  const [isOrgAdmin, setIsOrgAdmin] = useState(false)
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [venueName, setVenueName] = useState('')
  const [venueAddress, setVenueAddress] = useState('')
  const [venueCity, setVenueCity] = useState('')
  const [venueCountry, setVenueCountry] = useState('')
  const [numClasses, setNumClasses] = useState('')
  const [expectedParticipants, setExpectedParticipants] = useState('')
  const [numRaceCourses, setNumRaceCourses] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)
  const [arsRate, setArsRate] = useState<OfficialRate | null>(null)
  const [entrantsCount, setEntrantsCount] = useState<number | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('or')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)

  const isFounder = !!event && event.created_by === userId
  const isEventAdmin = isFounder || isOrgAdmin
  // Staff del check-in por decisión D4 del relevamiento: admin + secretario
  // + acreditador (no solo admin+secretario como el resto del roster).
  const isCheckinStaff =
    isEventAdmin || members?.some((m) => m.user_id === userId && ['secretario', 'acreditador'].includes(m.role)) || false

  const days = event ? eventDays(event.start_date, event.end_date) : 1
  const budgetUsd = event ? eventBudgetUsd(days, event.expected_participants ?? 0, event.num_race_courses ?? 0) : 0
  const daysToStart = event ? daysUntil(event.start_date) : null
  const showPaymentWarning = !!event && !event.paid && daysToStart !== null && daysToStart <= PAYMENT_WARNING_DAYS
  const isLocked = !!event && !event.paid && daysToStart !== null && daysToStart <= PAYMENT_LOCK_DAYS
  const overageCount =
    event && event.expected_participants != null && entrantsCount != null
      ? entrantsCount - event.expected_participants
      : 0
  const overageUsd = overageCount > 0 ? Math.round(overageCount * 0.3 * days * 100) / 100 : 0
  const finished = event ? isEventFinished(event.start_date, event.end_date) : false
  const [lifecycleSaving, setLifecycleSaving] = useState(false)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)

  useEffect(() => {
    if (event && !arsRate) {
      fetchOfficialArsRate().then(setArsRate)
    }
  }, [event, arsRate])

  const loadEvent = useCallback(async (eventId: string, currentUserId: string) => {
    const { data: eventRow } = await kalai
      .from('events')
      .select(
        'id, name, description, start_date, end_date, organization_id, created_by, venue_name, venue_address, venue_city, venue_country, num_classes, expected_participants, num_race_courses, paid, hidden_by_founder, organizations(name)',
      )
      .eq('id', eventId)
      .maybeSingle()

    if (!eventRow) {
      return null
    }
    const typedEvent = eventRow as unknown as EventRow
    setEvent(typedEvent)
    setName(typedEvent.name)
    setDescription(typedEvent.description ?? '')
    setStartDate(typedEvent.start_date ?? '')
    setEndDate(typedEvent.end_date ?? '')
    setVenueName(typedEvent.venue_name ?? '')
    setVenueAddress(typedEvent.venue_address ?? '')
    setVenueCity(typedEvent.venue_city ?? '')
    setVenueCountry(typedEvent.venue_country ?? '')
    setNumClasses(typedEvent.num_classes != null ? String(typedEvent.num_classes) : '')
    setExpectedParticipants(typedEvent.expected_participants != null ? String(typedEvent.expected_participants) : '')
    setNumRaceCourses(typedEvent.num_race_courses != null ? String(typedEvent.num_race_courses) : '')

    const { data: founderProfile } = await supabase.from('profiles').select('email').eq('id', typedEvent.created_by).maybeSingle()
    setFounderEmail(founderProfile?.email ?? typedEvent.created_by)

    if (typedEvent.organization_id) {
      const { data: myOrgMembership } = await kalai
        .from('organization_members')
        .select('role')
        .eq('organization_id', typedEvent.organization_id)
        .eq('user_id', currentUserId)
        .maybeSingle()
      setIsOrgAdmin(myOrgMembership?.role === 'admin')
    } else {
      setIsOrgAdmin(false)
    }

    const { data: memberRows } = await kalai
      .from('event_memberships')
      .select('role, user_id')
      .eq('event_id', eventId)

    const memberIds = (memberRows ?? []).map((m) => m.user_id)
    const { data: profileRows } = memberIds.length
      ? await supabase.from('profiles').select('id, email').in('id', memberIds)
      : { data: [] }
    const emailById = new Map((profileRows ?? []).map((p) => [p.id, p.email as string]))

    setMembers(
      (memberRows ?? []).map((m) => ({
        role: m.role,
        user_id: m.user_id,
        email: emailById.get(m.user_id) ?? m.user_id,
      })),
    )

    const { data: inviteRows } = await kalai
      .from('invitations')
      .select('id, email, role, status, token')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setInvitations(inviteRows ?? [])

    return typedEvent
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        setState('signedOut')
        return
      }
      setUserId(session.user.id)
      const eventRow = await loadEvent(id, session.user.id)
      setState(eventRow ? 'ready' : 'notFound')
    })
  }, [id, router, loadEvent])

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault()
    if (!event || !userId) return
    setInfoMsg(null)
    setSavingInfo(true)
    const { error } = await kalai
      .from('events')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        venue_name: venueName.trim() || null,
        venue_address: venueAddress.trim() || null,
        venue_city: venueCity.trim() || null,
        venue_country: venueCountry.trim() || null,
        num_classes: numClasses ? Number(numClasses) : null,
        expected_participants: expectedParticipants ? Number(expectedParticipants) : null,
        num_race_courses: numRaceCourses ? Number(numRaceCourses) : null,
      })
      .eq('id', event.id)
    setSavingInfo(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setInfoMsg('Guardado.')
    await loadEvent(event.id, userId)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!event || !userId) return
    setErrorMsg(null)
    setSaving(true)
    const { error } = await kalai.from('invitations').insert({
      event_id: event.id,
      organization_id: event.organization_id,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      invited_by: userId,
    })
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setInviteEmail('')
    await loadEvent(event.id, userId)
  }

  async function handleChangeRole(memberUserId: string, role: string) {
    if (!event || !userId) return
    setErrorMsg(null)
    const { error } = await kalai
      .from('event_memberships')
      .update({ role })
      .eq('event_id', event.id)
      .eq('user_id', memberUserId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await loadEvent(event.id, userId)
  }

  async function handleRemoveMember(memberUserId: string) {
    if (!event || !userId) return
    if (!window.confirm('¿Quitar a esta persona del evento?')) return
    setErrorMsg(null)
    const { error } = await kalai
      .from('event_memberships')
      .delete()
      .eq('event_id', event.id)
      .eq('user_id', memberUserId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setExpandedMemberId(null)
    await loadEvent(event.id, userId)
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!event || !userId) return
    if (!window.confirm('¿Cancelar esta invitación? El link deja de funcionar.')) return
    setErrorMsg(null)
    const { error } = await kalai.from('invitations').update({ status: 'revoked' }).eq('id', invitationId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await loadEvent(event.id, userId)
  }

  async function copyInviteLink(invitationId: string, token: string) {
    const link = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedInviteId(invitationId)
      setTimeout(() => setCopiedInviteId(null), 2000)
    } catch {
      // Clipboard API puede fallar (permiso, contexto no seguro) — el
      // link igual queda visible en pantalla para copiar a mano.
    }
  }

  async function handleDeleteEvent() {
    if (!event) return
    if (!window.confirm('¿Borrar este evento definitivamente? No se puede deshacer.')) return
    setLifecycleError(null)
    setLifecycleSaving(true)
    const { error } = await kalai.from('events').delete().eq('id', event.id)
    setLifecycleSaving(false)
    if (error) {
      setLifecycleError(error.message)
      return
    }
    router.push('/')
  }

  async function handleHideEvent() {
    if (!event) return
    setLifecycleError(null)
    setLifecycleSaving(true)
    const { error } = await kalai.from('events').update({ hidden_by_founder: true }).eq('id', event.id)
    setLifecycleSaving(false)
    if (error) {
      setLifecycleError(error.message)
      return
    }
    router.push('/')
  }

  if (state === 'loading' || state === 'signedOut') {
    return (
      <div className="page">
        <div className="subtitle">Cargando…</div>
      </div>
    )
  }

  if (state === 'notFound' || !event) {
    return (
      <div className="page" style={{ maxWidth: 400, paddingTop: 96 }}>
        <div className="card">
          <div className="error">No pertenecés a este evento, o no existe.</div>
        </div>
        <Link className="link" href="/">
          ← Volver a mi cuenta
        </Link>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="rowBetween">
        <Link className="link" href="/">
          ← Mi cuenta
        </Link>
      </div>

      {isLocked && isEventAdmin && (
        <div className="card" style={{ borderColor: 'var(--error)' }}>
          <div style={{ color: 'var(--error)', fontWeight: 700 }}>Evento bloqueado por falta de pago</div>
          <div className="subtitle">
            Faltan {PAYMENT_LOCK_DAYS} días o menos para el evento y el pago sigue pendiente — quedó en solo
            lectura. Escribinos para regularizarlo.
          </div>
        </div>
      )}
      {!isLocked && showPaymentWarning && isEventAdmin && (
        <div className="card" style={{ borderColor: '#d97706' }}>
          <div style={{ color: '#d97706', fontWeight: 700 }}>Pago pendiente</div>
          <div className="subtitle">
            Faltan {daysToStart} días para el evento. A los {PAYMENT_LOCK_DAYS} días o menos sin pago, el evento se
            bloquea. Escribinos para coordinar el pago.
          </div>
        </div>
      )}

      <form className="card" onSubmit={handleSaveInfo}>
        <div className="rowBetween">
          <div className="sectionTitle">Información general</div>
          {event.organizations && <span className="badge">{event.organizations.name}</span>}
        </div>
        {isEventAdmin ? (
          <>
            <fieldset disabled={isLocked} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div className="label">Nombre</div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <div className="label">Descripción</div>
                <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div className="label">Desde</div>
                  <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="label">Hasta</div>
                  <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
                  <input className="input" type="number" min="0" value={numClasses} onChange={(e) => setNumClasses(e.target.value)} />
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

              {infoMsg && <div className="success">{infoMsg}</div>}
              <button className="button" type="submit" disabled={savingInfo}>
                {savingInfo ? 'Guardando…' : 'Guardar'}
              </button>
            </fieldset>
          </>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{event.name}</div>
            {event.description && <div className="subtitle">{event.description}</div>}
            {(event.start_date || event.end_date) && (
              <div className="subtitle">
                {event.start_date ?? '?'} — {event.end_date ?? '?'}
              </div>
            )}
            {event.venue_name && (
              <div className="subtitle">
                {event.venue_name}
                {event.venue_city ? `, ${event.venue_city}` : ''}
              </div>
            )}
          </>
        )}
      </form>

      {isEventAdmin && (
        <div className="card">
          <div className="sectionTitle">Presupuesto y pago</div>
          <div className="subtitle">
            {days} día{days === 1 ? '' : 's'} · USD 0.3/participante/día + USD 5/cancha/día
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            USD {budgetUsd.toLocaleString('es-AR')}
            {arsRate && (
              <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--muted)' }}>
                {' '}
                ≈ ARS {Math.round(budgetUsd * arsRate.venta).toLocaleString('es-AR')} (oficial hoy)
              </span>
            )}
          </div>
          <div className="memberRow" style={{ borderBottom: 'none', paddingTop: 4 }}>
            <span>Estado</span>
            <span className="badge" style={event.paid ? {} : { background: '#fef3c7', color: '#92400e' }}>
              {event.paid ? 'Pagado' : 'Pendiente de pago'}
            </span>
          </div>
          {!event.paid && isEventAdmin && (
            <a
              className="button"
              style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
              href={`${process.env.NEXT_PUBLIC_COACH_DATA_WEB_URL ?? 'https://app.kalai.com.ar'}/evento-pago/${event.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Pagar ahora
            </a>
          )}
          {overageCount > 0 && (
            <div style={{ background: '#fef3c7', borderRadius: 10, padding: 16, fontSize: 14, color: '#92400e' }}>
              Tenés {entrantsCount} participantes cargados, {overageCount} más de los {event.expected_participants}{' '}
              pagados. Diferencia estimada: USD {overageUsd.toLocaleString('es-AR')}.
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="sectionTitle">Miembros</div>
        <div className="memberRow">
          <span>{founderEmail}</span>
          <span className="badge">Fundador</span>
        </div>
        {members && members.length > 0 ? (
          members.map((m) => {
            const expanded = expandedMemberId === m.user_id
            return (
              <div key={m.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <div
                  className="memberRow"
                  style={{ borderBottom: 'none', cursor: isEventAdmin ? 'pointer' : 'default' }}
                  onClick={() => isEventAdmin && setExpandedMemberId(expanded ? null : m.user_id)}
                >
                  <span>{m.email}</span>
                  <span className="badge">{EVENT_ROLE_LABELS[m.role] ?? m.role}</span>
                </div>
                {isEventAdmin && expanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
                    <div>
                      <div className="label">Rol</div>
                      <select
                        className="select"
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                      >
                        {Object.entries(EVENT_ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {errorMsg && <div className="error">{errorMsg}</div>}
                    <button
                      className="button buttonSecondary"
                      style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                      onClick={() => handleRemoveMember(m.user_id)}
                    >
                      Quitar del evento
                    </button>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="subtitle">Todavía no hay oficiales de regata ni acreditadores.</div>
        )}

        {invitations && invitations.length > 0 && (
          <>
            <div className="sectionTitle" style={{ marginTop: 8 }}>
              Invitaciones pendientes
            </div>
            {invitations.map((inv) => {
              const expanded = expandedInviteId === inv.id
              return (
                <div key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <div
                    className="memberRow"
                    style={{ borderBottom: 'none', cursor: 'pointer' }}
                    onClick={() => setExpandedInviteId(expanded ? null : inv.id)}
                  >
                    <span>{inv.email}</span>
                    <span className="badge">{EVENT_ROLE_LABELS[inv.role] ?? inv.role}</span>
                  </div>
                  {expanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 }}>
                      <div className="code">{`${window.location.origin}/invite/${inv.token}`}</div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <button
                          className="link"
                          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                          onClick={() => copyInviteLink(inv.id, inv.token)}
                        >
                          {copiedInviteId === inv.id ? '¡Copiado!' : 'Copiar link'}
                        </button>
                        <button
                          className="link"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }}
                          onClick={() => handleRevokeInvitation(inv.id)}
                        >
                          Cancelar invitación
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {isEventAdmin && !isLocked && (
          <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
            <div className="sectionTitle">Invitar miembro</div>
            <div>
              <div className="label">Email</div>
              <input
                className="input"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <div className="label">Rol</div>
              <select className="select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {EVENT_INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {EVENT_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            {errorMsg && <div className="error">{errorMsg}</div>}
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Invitando…' : 'Invitar'}
            </button>
          </form>
        )}
      </div>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Suscripciones</div>
          <span className="badge">Próximamente</span>
        </div>
      </div>

      {(isEventAdmin || !!members?.length) && userId && (
        <>
          <RosterSection
            title="Participantes"
            table="event_entrants"
            eventId={event.id}
            userId={userId}
            canEdit={isEventAdmin || members?.some((m) => m.user_id === userId && m.role === 'secretario') || false}
            locked={isLocked}
            fields={PARTICIPANT_FIELDS}
            aliases={PARTICIPANT_ALIASES}
            emptyMessage="Todavía no hay participantes cargados."
            onCountChange={setEntrantsCount}
          />

          <RosterSection
            title="Entrenadores"
            table="event_coaches"
            eventId={event.id}
            userId={userId}
            canEdit={isEventAdmin || members?.some((m) => m.user_id === userId && m.role === 'secretario') || false}
            locked={isLocked}
            fields={COACH_FIELDS}
            aliases={COACH_ALIASES}
            emptyMessage="Todavía no hay entrenadores cargados."
          />

          <VentanasSection
            supabase={supabase}
            eventId={event.id}
            userId={userId}
            canEdit={isCheckinStaff}
            locked={isLocked}
          />
        </>
      )}

      {isEventAdmin && (
        <RaceCoursesSection
          eventId={event.id}
          eventName={event.name}
          venueName={event.venue_name}
          startDate={event.start_date}
          endDate={event.end_date}
          numRaceCourses={event.num_race_courses}
          canEdit={isEventAdmin}
          locked={isLocked}
        />
      )}

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Calendario</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">Fechas de cada clase, OR de cada cancha, balizadores por cancha/día, marineros.</div>
      </div>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Material</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">Listado de botes, boyas y lanchas del evento.</div>
      </div>

      {isFounder && (
        <div className="card" style={{ borderColor: 'var(--error)' }}>
          <div className="sectionTitle" style={{ color: 'var(--error)' }}>
            Zona de peligro
          </div>
          {finished ? (
            <>
              <div className="subtitle">Este evento ya finalizó. Se puede borrar en forma definitiva.</div>
              {lifecycleError && <div className="error">{lifecycleError}</div>}
              <button
                className="button"
                style={{ background: 'var(--error)' }}
                onClick={handleDeleteEvent}
                disabled={lifecycleSaving}
              >
                {lifecycleSaving ? 'Borrando…' : 'Borrar definitivamente'}
              </button>
            </>
          ) : event.paid ? (
            <>
              <div className="subtitle">
                Este evento ya está pago — no se puede borrar mientras esté vigente. Lo podés sacar de tu listado
                (sigue existiendo normal para el resto de los miembros) y se borra solo cuando finalice.
              </div>
              {lifecycleError && <div className="error">{lifecycleError}</div>}
              <button className="button buttonSecondary" onClick={handleHideEvent} disabled={lifecycleSaving}>
                {lifecycleSaving ? 'Ocultando…' : 'Ocultar de mi listado'}
              </button>
            </>
          ) : (
            <>
              <div className="subtitle">Este evento todavía no está pago — se puede borrar en cualquier momento.</div>
              {lifecycleError && <div className="error">{lifecycleError}</div>}
              <button
                className="button"
                style={{ background: 'var(--error)' }}
                onClick={handleDeleteEvent}
                disabled={lifecycleSaving}
              >
                {lifecycleSaving ? 'Borrando…' : 'Borrar evento'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
