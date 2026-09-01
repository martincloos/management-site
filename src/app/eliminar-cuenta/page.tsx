'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Step = 'email' | 'otp' | 'done'

export default function EliminarCuentaPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setSending(false)
    if (error) {
      setErrorMsg('No pudimos enviar el código. Revisá que el email sea el de tu cuenta de Kalai.')
      return
    }
    setStep('otp')
  }

  async function handleConfirmDelete(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setDeleting(true)

    const { error: otpError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode.trim(),
      type: 'email',
    })
    if (otpError) {
      setDeleting(false)
      setErrorMsg('Código incorrecto. Revisalo e intentá de nuevo.')
      return
    }

    const { data, error } = await supabase.functions.invoke('delete-account')
    setDeleting(false)

    if (error || data?.error) {
      setErrorMsg(data?.error ?? error?.message ?? 'No pudimos eliminar tu cuenta. Escribinos a info@kalai.com.ar.')
      return
    }

    await supabase.auth.signOut()
    setStep('done')
  }

  return (
    <div className="page" style={{ maxWidth: 480, paddingTop: 64 }}>
      <div>
        <Link href="/" className="link">← Kalai Analytics</Link>
        <div className="title" style={{ marginTop: 16 }}>Eliminar tu cuenta</div>
        <div className="subtitle" style={{ marginTop: 4 }}>
          Esto borra para siempre tu cuenta de Coach Data, tus sesiones y todas tus mediciones. No se puede
          deshacer.
        </div>
      </div>

      {step === 'email' && (
        <form className="card" onSubmit={handleRequestCode}>
          <div>
            <div className="label">Email de tu cuenta</div>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          {errorMsg && <div className="error">{errorMsg}</div>}
          <button className="button" type="submit" disabled={sending || !email.trim()}>
            {sending ? 'Enviando…' : 'Enviar código de confirmación'}
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form className="card" onSubmit={handleConfirmDelete}>
          <div className="subtitle">
            Te mandamos un código de 6 dígitos a <strong>{email}</strong>. Ingresalo para confirmar el borrado de
            tu cuenta.
          </div>
          <div>
            <div className="label">Código</div>
            <input
              className="input"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              required
            />
          </div>
          {errorMsg && <div className="error">{errorMsg}</div>}
          <button className="button" type="submit" disabled={deleting || otpCode.trim().length < 6}>
            {deleting ? 'Eliminando tu cuenta…' : 'Confirmar y eliminar cuenta'}
          </button>
          <button
            type="button"
            className="link"
            style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            onClick={(e) => handleRequestCode(e as unknown as React.FormEvent)}
            disabled={sending}
          >
            Reenviar código
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="card">
          <div className="success">Tu cuenta y todos tus datos se eliminaron.</div>
        </div>
      )}
    </div>
  )
}
