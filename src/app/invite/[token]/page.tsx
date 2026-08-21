'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, kalai } from '@/lib/supabase'
import { ROLE_LABELS } from '@/lib/roles'

interface InvitationPreview {
  id: string
  role: string
  status: string
  organizationName: string
}

type ViewState = 'loading' | 'signedOut' | 'notFound' | 'ready' | 'accepted'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<ViewState>('loading')
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setState('signedOut')
        return
      }

      const { data: inv } = await kalai
        .from('invitations')
        .select('id, role, status, organization_id')
        .eq('token', token)
        .maybeSingle()

      if (!inv) {
        setState('notFound')
        return
      }

      const { data: org } = await kalai.from('organizations').select('name').eq('id', inv.organization_id).single()

      setInvitation({ id: inv.id, role: inv.role, status: inv.status, organizationName: org?.name ?? 'tu organización' })
      setState('ready')
    }
    load()
  }, [token])

  async function handleAccept() {
    setErrorMsg(null)
    setAccepting(true)
    const { error } = await kalai.rpc('accept_invitation', { p_token: token })
    setAccepting(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setState('accepted')
  }

  if (state === 'loading') {
    return (
      <div className="page">
        <div className="subtitle">Cargando…</div>
      </div>
    )
  }

  if (state === 'signedOut') {
    return (
      <div className="page" style={{ maxWidth: 400, paddingTop: 96 }}>
        <div>
          <div className="title">Kalai Analytics</div>
          <div className="subtitle">Iniciá sesión o creá tu cuenta para ver esta invitación.</div>
        </div>
        <button className="button" onClick={() => router.push('/login')}>
          Ir a login
        </button>
      </div>
    )
  }

  if (state === 'notFound') {
    return (
      <div className="page" style={{ maxWidth: 400, paddingTop: 96 }}>
        <div className="card">
          <div className="error">Esta invitación no existe, ya fue usada, o es para otra cuenta.</div>
        </div>
      </div>
    )
  }

  if (state === 'accepted') {
    return (
      <div className="page" style={{ maxWidth: 400, paddingTop: 96 }}>
        <div className="card">
          <div className="success">¡Listo! Ya formás parte de {invitation?.organizationName}.</div>
          <button className="button" onClick={() => router.push('/cuenta')}>
            Ir a mi cuenta
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 400, paddingTop: 96 }}>
      <div className="card">
        <div className="title" style={{ fontSize: 20 }}>
          Invitación a {invitation?.organizationName}
        </div>
        <div className="subtitle">
          Te invitaron a unirte como {invitation ? (ROLE_LABELS[invitation.role] ?? invitation.role) : ''}.
        </div>
        {errorMsg && <div className="error">{errorMsg}</div>}
        <button className="button" onClick={handleAccept} disabled={accepting}>
          {accepting ? 'Aceptando…' : 'Aceptar invitación'}
        </button>
      </div>
    </div>
  )
}
