'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type GateState = 'loading' | 'signedOut' | 'ready'

export default function PerfilPage() {
  const router = useRouter()
  const [state, setState] = useState<GateState>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        setState('signedOut')
        return
      }
      setUserId(session.user.id)
      setEmail(session.user.email ?? '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle()
      setName(profile?.name ?? '')
      setPhone(profile?.phone ?? '')
      setAvatarUrl(profile?.avatar_url ?? null)
      setState('ready')
    })
  }, [router])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setProfileError(null)
    setProfileMsg(null)
    setSavingProfile(true)
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim() || null, phone: phone.trim() || null })
      .eq('id', userId)
    setSavingProfile(false)
    if (error) {
      setProfileError(error.message)
      return
    }
    setProfileMsg('Guardado.')
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setProfileError(null)
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) {
      setUploadingAvatar(false)
      setProfileError(uploadError.message)
      return
    }
    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${publicUrlData.publicUrl}?t=${Date.now()}`
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
    setUploadingAvatar(false)
    if (updateError) {
      setProfileError(updateError.message)
      return
    }
    setAvatarUrl(url)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordMsg(null)
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) {
      setPasswordError(error.message)
      return
    }
    setNewPassword('')
    setPasswordMsg('Contraseña actualizada.')
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
        <Link className="link" href="/cuenta">
          ← Mi cuenta
        </Link>
      </div>

      <div>
        <div className="title" style={{ fontSize: 22 }}>
          Información personal
        </div>
      </div>

      <form className="card" onSubmit={handleSaveProfile}>
        <div className="rowBetween">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Foto de perfil"
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--on-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                fontWeight: 700,
              }}
            >
              {(name || email || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <label className="link" style={{ cursor: 'pointer' }}>
            {uploadingAvatar ? 'Subiendo…' : 'Cambiar foto'}
            <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} disabled={uploadingAvatar} />
          </label>
        </div>

        <div>
          <div className="label">Email</div>
          <input className="input" value={email} disabled style={{ opacity: 0.6 }} />
        </div>
        <div>
          <div className="label">Nombre</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="label">Teléfono</div>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 9 ..." />
        </div>
        {profileError && <div className="error">{profileError}</div>}
        {profileMsg && <div className="success">{profileMsg}</div>}
        <button className="button" type="submit" disabled={savingProfile}>
          {savingProfile ? 'Guardando…' : 'Guardar'}
        </button>
      </form>

      <div className="card">
        <div className="sectionTitle">Medios de pago</div>
        <div className="subtitle">
          Kalai no guarda tarjetas ni medios de pago propios — se gestionan directamente en Mercado Pago o Lemon
          Squeezy al momento de suscribirte a un producto.
        </div>
      </div>

      <form className="card" onSubmit={handleChangePassword}>
        <div className="sectionTitle">Contraseña</div>
        <div>
          <div className="label">Nueva contraseña</div>
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        {passwordError && <div className="error">{passwordError}</div>}
        {passwordMsg && <div className="success">{passwordMsg}</div>}
        <button className="button buttonSecondary" type="submit" disabled={savingPassword}>
          {savingPassword ? 'Actualizando…' : 'Actualizar contraseña'}
        </button>
      </form>
    </div>
  )
}
