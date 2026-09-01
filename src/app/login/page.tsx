'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [checkEmailMsg, setCheckEmailMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) {
        setErrorMsg(error.message)
        return
      }
      router.push('/cuenta')
      return
    }

    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    if (!data.session) {
      setCheckEmailMsg('Revisá tu email para confirmar la cuenta.')
      return
    }
    router.push('/cuenta')
  }

  return (
    <div className="page" style={{ maxWidth: 400, paddingTop: 96 }}>
      <div>
        <div className="title">Kalai Analytics</div>
        <div className="subtitle">
          {mode === 'login' ? 'Ingresá con tu cuenta de Kalai.' : 'Creá tu cuenta de Kalai.'}
        </div>
      </div>

      {checkEmailMsg ? (
        <div className="card">
          <div className="success">{checkEmailMsg}</div>
        </div>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          <div>
            <div className="label">Email</div>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <div className="label">Contraseña</div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </div>
          {errorMsg && <div className="error">{errorMsg}</div>}
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        </form>
      )}

      <button
        className="link"
        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login')
          setErrorMsg(null)
          setCheckEmailMsg(null)
        }}
      >
        {mode === 'login' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Ingresá'}
      </button>
    </div>
  )
}
