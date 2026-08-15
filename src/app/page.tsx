'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, kalai } from '@/lib/supabase'
import { ROLE_LABELS, INVITABLE_ROLES } from '@/lib/roles'

interface Organization {
  id: string
  name: string
  type: string
  admin_user_id: string
}

interface Membership {
  role: string
  organization_id: string
  organizations: Organization
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

type GateState = 'loading' | 'signedOut' | 'ready'

const ORG_TYPES = [
  { value: 'club', label: 'Club' },
  { value: 'federacion', label: 'Federación' },
  { value: 'asociacion', label: 'Asociación' },
]

export default function HomePage() {
  const router = useRouter()
  const [state, setState] = useState<GateState>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [memberships, setMemberships] = useState<Membership[] | null>(null)
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null)

  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('club')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('coach')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)

  const activeMembership = memberships?.find((m) => m.organization_id === activeOrgId) ?? memberships?.[0] ?? null
  const activeOrg = activeMembership?.organizations ?? null
  const myMembership = members?.find((m) => m.user_id === userId) ?? null
  const isAdmin = myMembership?.role === 'admin'

  const loadOrgDetails = useCallback(async (organizationId: string) => {
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
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        setState('signedOut')
        return
      }
      setUserId(session.user.id)
      setUserEmail(session.user.email ?? null)

      const { data: subscriptionRow } = await supabase
        .from('subscriptions')
        .select('plan_type, status, expires_at, trial_ends_at')
        .eq('user_id', session.user.id)
        .maybeSingle()
      setSubscription(subscriptionRow)

      const { data: membershipRows } = await kalai
        .from('organization_members')
        .select('role, organization_id, organizations(id, name, type, admin_user_id)')
        .eq('user_id', session.user.id)

      const typed = (membershipRows ?? []) as unknown as Membership[]
      setMemberships(typed)
      if (typed.length > 0) {
        setActiveOrgId(typed[0].organization_id)
        await loadOrgDetails(typed[0].organization_id)
      }
      setState('ready')
    })
  }, [router, loadOrgDetails])

  useEffect(() => {
    if (activeOrgId) loadOrgDetails(activeOrgId)
  }, [activeOrgId, loadOrgDetails])

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setSaving(true)
    const { data, error } = await kalai.rpc('create_organization', { p_name: orgName, p_type: orgType })
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    const { data: membershipRows } = await kalai
      .from('organization_members')
      .select('role, organization_id, organizations(id, name, type, admin_user_id)')
      .eq('user_id', userId as string)
    const typed = (membershipRows ?? []) as unknown as Membership[]
    setMemberships(typed)
    if (data?.id) {
      setActiveOrgId(data.id)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!activeOrg || !userId) return
    setErrorMsg(null)
    setSaving(true)
    const { error } = await kalai.from('invitations').insert({
      organization_id: activeOrg.id,
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
    await loadOrgDetails(activeOrg.id)
  }

  async function handleChangeRole(memberUserId: string, role: string) {
    if (!activeOrg) return
    setErrorMsg(null)
    const { error } = await kalai
      .from('organization_members')
      .update({ role })
      .eq('organization_id', activeOrg.id)
      .eq('user_id', memberUserId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await loadOrgDetails(activeOrg.id)
  }

  async function handleRemoveMember(memberUserId: string) {
    if (!activeOrg) return
    if (!window.confirm('¿Quitar a esta persona de la organización?')) return
    setErrorMsg(null)
    const { error } = await kalai
      .from('organization_members')
      .delete()
      .eq('organization_id', activeOrg.id)
      .eq('user_id', memberUserId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setExpandedMemberId(null)
    await loadOrgDetails(activeOrg.id)
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!activeOrg) return
    if (!window.confirm('¿Cancelar esta invitación? El link deja de funcionar.')) return
    setErrorMsg(null)
    const { error } = await kalai.from('invitations').update({ status: 'revoked' }).eq('id', invitationId)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await loadOrgDetails(activeOrg.id)
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

  return (
    <div className="page">
      <div className="rowBetween">
        <div>
          <div className="title">Kalai Analytics</div>
          <div className="subtitle">Tu cuenta de Kalai.</div>
        </div>
        <button className="button buttonSecondary" onClick={handleSignOut}>
          Cerrar sesión
        </button>
      </div>

      <div className="card">
        <div className="rowBetween">
          <div>
            <div className="sectionTitle">Tu cuenta</div>
            <div style={{ fontSize: 16, marginTop: 4 }}>{userEmail}</div>
          </div>
          <span className="badge">{isCurrentlyPro(subscription) ? 'Pro' : 'Gratis'}</span>
        </div>
      </div>

      {!activeOrg ? (
        <form className="card" onSubmit={handleCreateOrg}>
          <div className="sectionTitle">Crear organización</div>
          <div className="subtitle">
            ¿Tu club ya tiene una organización en Kalai? Pedile a quien la administra el link de invitación en vez de
            crear una nueva.
          </div>
          <div>
            <div className="label">Nombre</div>
            <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
          </div>
          <div>
            <div className="label">Tipo</div>
            <select className="select" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
              {ORG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {errorMsg && <div className="error">{errorMsg}</div>}
          <button className="button" type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear organización'}
          </button>
        </form>
      ) : (
        <>
          <div className="card">
            <div className="rowBetween">
              <div>
                <div className="sectionTitle">Organización</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{activeOrg.name}</div>
              </div>
              <span className="badge">{ORG_TYPES.find((t) => t.value === activeOrg.type)?.label ?? activeOrg.type}</span>
            </div>
            {memberships && memberships.length > 1 && (
              <div>
                <div className="label">Cambiar de organización</div>
                <select className="select" value={activeOrgId ?? ''} onChange={(e) => setActiveOrgId(e.target.value)}>
                  {memberships.map((m) => (
                    <option key={m.organization_id} value={m.organization_id}>
                      {m.organizations.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="card">
            <div className="sectionTitle">Miembros</div>
            {members && members.length > 0 ? (
              members.map((m) => {
                const expanded = expandedMemberId === m.user_id
                return (
                  <div key={m.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <div
                      className="memberRow"
                      style={{ borderBottom: 'none', cursor: isAdmin ? 'pointer' : 'default' }}
                      onClick={() => isAdmin && setExpandedMemberId(expanded ? null : m.user_id)}
                    >
                      <span>{m.email}</span>
                      <span className="badge">{ROLE_LABELS[m.role] ?? m.role}</span>
                    </div>
                    {isAdmin && expanded && (
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
        </>
      )}
    </div>
  )
}
