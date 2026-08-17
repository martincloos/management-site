'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, kalai } from '@/lib/supabase'
import { ROLE_LABELS, INVITABLE_ROLES } from '@/lib/roles'

interface Organization {
  id: string
  name: string
  type: string
  description: string | null
  admin_user_id: string
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
  status: string
  token: string
}

interface EventRow {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
}

type GateState = 'loading' | 'signedOut' | 'notFound' | 'ready'

const ORG_TYPES: Record<string, string> = {
  club: 'Club',
  federacion: 'Federación',
  asociacion: 'Asociación',
}

export default function OrganizationPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<GateState>('loading')
  const [userId, setUserId] = useState<string | null>(null)

  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])

  const [name, setName] = useState('')
  const [type, setType] = useState('club')
  const [description, setDescription] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('coach')
  const [transferTargetId, setTransferTargetId] = useState('')
  const [saving, setSaving] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)

  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [eventName, setEventName] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')
  const [creatingEvent, setCreatingEvent] = useState(false)

  const myMembership = members?.find((m) => m.user_id === userId) ?? null
  const isAdmin = myMembership?.role === 'admin'
  const isFounder = !!org && org.admin_user_id === userId

  const loadOrg = useCallback(async (organizationId: string) => {
    const { data: orgRow } = await kalai
      .from('organizations')
      .select('id, name, type, description, admin_user_id')
      .eq('id', organizationId)
      .maybeSingle()

    if (!orgRow) {
      setOrg(null)
      return null
    }
    setOrg(orgRow)
    setName(orgRow.name)
    setType(orgRow.type)
    setDescription(orgRow.description ?? '')

    const { data: eventRows } = await kalai
      .from('events')
      .select('id, name, start_date, end_date')
      .eq('organization_id', organizationId)
      .order('start_date', { ascending: false })
    setEvents(eventRows ?? [])

    const { data: memberRows } = await kalai
      .from('organization_members')
      .select('role, user_id')
      .eq('organization_id', organizationId)

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
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setInvitations(inviteRows ?? [])

    return orgRow
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        setState('signedOut')
        return
      }
      setUserId(session.user.id)

      const orgRow = await loadOrg(id)
      setState(orgRow ? 'ready' : 'notFound')
    })
  }, [id, router, loadOrg])

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault()
    if (!org) return
    setInfoMsg(null)
    setSavingInfo(true)
    const { error } = await kalai
      .from('organizations')
      .update({ name: name.trim(), type, description: description.trim() || null })
      .eq('id', org.id)
    setSavingInfo(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setInfoMsg('Guardado.')
    await loadOrg(org.id)
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!org) return
    setErrorMsg(null)
    setCreatingEvent(true)
    const { data, error } = await kalai.rpc('create_event', {
      p_name: eventName,
      p_description: eventDescription.trim() || null,
      p_start_date: eventStart || null,
      p_end_date: eventEnd || null,
      p_organization_id: org.id,
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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!org || !userId) return
    setErrorMsg(null)
    setSaving(true)
    const { error } = await kalai.from('invitations').insert({
      organization_id: org.id,
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
    await loadOrg(org.id)
  }

  async function handleChangeRole(memberUserId: string, role: string) {
    if (!org) return
    setErrorMsg(null)
    const { error } = await kalai
      .from('organization_members')
      .update({ role })
      .eq('organization_id', org.id)
      .eq('user_id', memberUserId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await loadOrg(org.id)
  }

  async function handleRemoveMember(memberUserId: string) {
    if (!org) return
    if (!window.confirm('¿Quitar a esta persona de la organización?')) return
    setErrorMsg(null)
    const { error } = await kalai
      .from('organization_members')
      .delete()
      .eq('organization_id', org.id)
      .eq('user_id', memberUserId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setExpandedMemberId(null)
    await loadOrg(org.id)
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!org) return
    if (!window.confirm('¿Cancelar esta invitación? El link deja de funcionar.')) return
    setErrorMsg(null)
    const { error } = await kalai.from('invitations').update({ status: 'revoked' }).eq('id', invitationId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await loadOrg(org.id)
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

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!org || !transferTargetId) return
    const targetEmail = members?.find((m) => m.user_id === transferTargetId)?.email
    if (!window.confirm(`¿Transferir la administración principal a ${targetEmail}? No vas a poder deshacerlo vos mismo — la otra persona pasaría a ser quien puede transferirla de nuevo.`)) {
      return
    }
    setErrorMsg(null)
    setTransferring(true)
    const { error } = await kalai.rpc('transfer_org_ownership', {
      p_organization_id: org.id,
      p_new_founder_user_id: transferTargetId,
    })
    setTransferring(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setTransferTargetId('')
    await loadOrg(org.id)
  }

  if (state === 'loading' || state === 'signedOut') {
    return (
      <div className="page">
        <div className="subtitle">Cargando…</div>
      </div>
    )
  }

  if (state === 'notFound' || !org) {
    return (
      <div className="page" style={{ maxWidth: 400, paddingTop: 96 }}>
        <div className="card">
          <div className="error">No pertenecés a esta organización, o no existe.</div>
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
        <div className="sectionTitle">Información general</div>
        {isAdmin ? (
          <>
            <div>
              <div className="label">Nombre</div>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <div className="label">Tipo</div>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(ORG_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="label">Descripción</div>
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Qué es, objetivos…"
              />
            </div>
            {infoMsg && <div className="success">{infoMsg}</div>}
            <button className="button" type="submit" disabled={savingInfo}>
              {savingInfo ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        ) : (
          <div className="rowBetween">
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{org.name}</div>
              {org.description && <div className="subtitle" style={{ marginTop: 4 }}>{org.description}</div>}
            </div>
            <span className="badge">{ORG_TYPES[org.type] ?? org.type}</span>
          </div>
        )}
      </form>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Suscripciones</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">Coach Data Pro y Regatta RC a nombre de la organización.</div>
      </div>

      <div className="card">
        <div className="sectionTitle">Miembros</div>
        {members && members.length > 0 ? (
          members.map((m) => {
            const expanded = expandedMemberId === m.user_id
            const memberIsFounder = m.user_id === org.admin_user_id
            const canEditThisRow = isAdmin && !memberIsFounder
            return (
              <div key={m.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <div
                  className="memberRow"
                  style={{ borderBottom: 'none', cursor: canEditThisRow ? 'pointer' : 'default' }}
                  onClick={() => canEditThisRow && setExpandedMemberId(expanded ? null : m.user_id)}
                >
                  <span>{m.email}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {memberIsFounder && <span className="badge">Fundador</span>}
                    <span className="badge">{ROLE_LABELS[m.role] ?? m.role}</span>
                  </div>
                </div>
                {canEditThisRow && expanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
                    <div>
                      <div className="label">Rol</div>
                      <select
                        className="select"
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
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
                      Quitar de la organización
                    </button>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="subtitle">Todavía no hay miembros.</div>
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
                    <span className="badge">{ROLE_LABELS[inv.role] ?? inv.role}</span>
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

        {isAdmin && (
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
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
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

      {isFounder && members && members.length > 1 && (
        <form className="card" onSubmit={handleTransfer}>
          <div className="sectionTitle">Transferir administración principal</div>
          <div className="subtitle">
            Sos el admin fundador: solo vos podés borrar la organización, y nadie puede sacarte de admin. Si querés
            dejarle esa responsabilidad a otra persona, elegila acá — vos vas a seguir siendo admin, pero dejás de
            ser el fundador.
          </div>
          <div>
            <div className="label">Nuevo admin principal</div>
            <select className="select" value={transferTargetId} onChange={(e) => setTransferTargetId(e.target.value)} required>
              <option value="" disabled>
                Elegí un miembro
              </option>
              {members
                .filter((m) => m.user_id !== userId)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.email}
                  </option>
                ))}
            </select>
          </div>
          {errorMsg && <div className="error">{errorMsg}</div>}
          <button className="button buttonSecondary" type="submit" disabled={transferring || !transferTargetId}>
            {transferring ? 'Transfiriendo…' : 'Transferir administración principal'}
          </button>
        </form>
      )}

      <div className="card">
        <div className="rowBetween">
          <div className="sectionTitle">Eventos</div>
          {isAdmin && (
            <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowCreateEvent((v) => !v)}>
              {showCreateEvent ? 'Cancelar' : '+ Crear'}
            </button>
          )}
        </div>

        {events.length > 0 ? (
          events.map((ev) => (
            <Link key={ev.id} href={`/eventos/${ev.id}`} className="memberRow" style={{ cursor: 'pointer' }}>
              <span>{ev.name}</span>
              <span className="subtitle">
                {ev.start_date ?? ''}
                {ev.end_date && ev.end_date !== ev.start_date ? ` — ${ev.end_date}` : ''}
              </span>
            </Link>
          ))
        ) : (
          <div className="subtitle">Todavía no hay eventos organizados por el club.</div>
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
      </div>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Clases</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">Tipos de barcos, entrenadores a cargo de cada una, horarios, calendario.</div>
      </div>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Alumnos</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">Listado de chicos anotados, ficha médica, contacto, clase en la que navegan.</div>
      </div>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Material</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">Listado de botes, asignación de cada uno, estado, fallas.</div>
      </div>

      <div className="card" style={{ opacity: 0.5 }}>
        <div className="rowBetween">
          <div className="sectionTitle">Calendario</div>
          <span className="badge">Próximamente</span>
        </div>
        <div className="subtitle">Fechas de entrenamientos, campeonatos, traslados, dividido por clase/entrenador.</div>
      </div>
    </div>
  )
}
