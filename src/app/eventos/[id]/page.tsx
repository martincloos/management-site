'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, kalai } from '@/lib/supabase'
import { EVENT_ROLE_LABELS, EVENT_INVITABLE_ROLES } from '@/lib/roles'

interface EventRow {
  id: string
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
  organization_id: string | null
  created_by: string
  organizations: { name: string } | null
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
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('or')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)

  const isFounder = !!event && event.created_by === userId
  const isEventAdmin = isFounder || isOrgAdmin

  const loadEvent = useCallback(async (eventId: string, currentUserId: string) => {
    const { data: eventRow } = await kalai
      .from('events')
      .select('id, name, description, start_date, end_date, organization_id, created_by, organizations(name)')
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

      <form className="card" onSubmit={handleSaveInfo}>
        <div className="rowBetween">
          <div className="sectionTitle">Información general</div>
          {event.organizations && <span className="badge">{event.organizations.name}</span>}
        </div>
        {isEventAdmin ? (
          <>
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
            {infoMsg && <div className="success">{infoMsg}</div>}
            <button className="button" type="submit" disabled={savingInfo}>
              {savingInfo ? 'Guardando…' : 'Guardar'}
            </button>
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
          </>
        )}
      </form>

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

        {isEventAdmin && (
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

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Entrenadores</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">
          Listado de entrenadores con ficha médica, contacto, clase, club y chicos a cargo — depende del schema de
          inscriptos de Regatta RC (bloqueado por el CSV real del club).
        </div>
      </div>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Participantes</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">
          Listado de participantes con contacto, club, clase, edad y ficha médica — depende del schema de inscriptos
          de Regatta RC (bloqueado por el CSV real del club).
        </div>
      </div>

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
    </div>
  )
}
