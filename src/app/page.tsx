'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, kalai } from '@/lib/supabase'

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
  status: string
  token: string
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

  const [memberships, setMemberships] = useState<Membership[] | null>(null)
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null)

  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('club')
  const [inviteEmail, setInviteEmail] = useState('')
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const activeMembership = memberships?.find((m) => m.organization_id === activeOrgId) ?? memberships?.[0] ?? null
  const activeOrg = activeMembership?.organizations ?? null
  const isAdmin = activeOrg && userId ? activeOrg.admin_user_id === userId : false

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
      .select('id, email, status, token')
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
    const { data, error } = await kalai
      .from('invitations')
      .insert({
        organization_id: activeOrg.id,
        email: inviteEmail.trim().toLowerCase(),
        role: 'entrenador',
        invited_by: userId,
      })
      .select('token')
      .single()
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setLastInviteLink(`${window.location.origin}/invite/${data.token}`)
    setInviteEmail('')
    await loadOrgDetails(activeOrg.id)
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
          <div className="subtitle">Gestión de tu organización.</div>
        </div>
        <button className="button buttonSecondary" onClick={handleSignOut}>
          Cerrar sesión
        </button>
      </div>

      {!activeOrg ? (
        <form className="card" onSubmit={handleCreateOrg}>
          <div className="sectionTitle">Crear organización</div>
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
            <div className="sectionTitle">Entrenadores</div>
            {members && members.length > 0 ? (
              members.map((m) => (
                <div className="memberRow" key={m.user_id}>
                  <span>{m.email}</span>
                  <span className="badge">{m.role === 'admin' ? 'Admin' : 'Entrenador'}</span>
                </div>
              ))
            ) : (
              <div className="subtitle">Todavía no hay entrenadores.</div>
            )}

            {invitations && invitations.length > 0 && (
              <>
                <div className="sectionTitle" style={{ marginTop: 8 }}>
                  Invitaciones pendientes
                </div>
                {invitations.map((inv) => (
                  <div className="memberRow" key={inv.id}>
                    <span>{inv.email}</span>
                    <button
                      className="link"
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => setLastInviteLink(`${window.location.origin}/invite/${inv.token}`)}
                    >
                      Copiar link
                    </button>
                  </div>
                ))}
              </>
            )}

            {isAdmin && (
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                <div className="sectionTitle">Invitar entrenador</div>
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
                {errorMsg && <div className="error">{errorMsg}</div>}
                <button className="button" type="submit" disabled={saving}>
                  {saving ? 'Invitando…' : 'Invitar'}
                </button>
                {lastInviteLink && (
                  <div>
                    <div className="label">Mandale este link a la persona invitada:</div>
                    <div className="code">{lastInviteLink}</div>
                  </div>
                )}
              </form>
            )}
          </div>
        </>
      )}
    </div>
  )
}
