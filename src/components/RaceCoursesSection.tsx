'use client'

import { useCallback, useEffect, useState } from 'react'
import { regatta, ensureRegattaSession } from '@/lib/regatta'

interface RaceClass {
  id: string
  label: string
}

interface RaceCourseRow {
  id: string
  label: string
  access_code: string | null
  class_id: string
  race_classes: { label: string } | null
}

interface RaceCoursesSectionProps {
  eventId: string
  eventName: string
  venueName: string | null
  startDate: string | null
  endDate: string | null
  numRaceCourses: number | null
  canEdit: boolean
  locked: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

// Los errores de Supabase (PostgrestError, AuthError) NO son instancias
// de Error nativas — tienen `.message` pero `err instanceof Error` da
// false, así que un catch genérico los pierde. Esto cubre ambos casos.
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message
  return 'No se pudo conectar con Regatta CR'
}

export default function RaceCoursesSection({
  eventId,
  eventName,
  venueName,
  startDate,
  endDate,
  numRaceCourses,
  canEdit,
  locked,
}: RaceCoursesSectionProps) {
  const [state, setState] = useState<LoadState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [courses, setCourses] = useState<RaceCourseRow[]>([])
  const [classes, setClasses] = useState<RaceClass[]>([])
  const [classId, setClassId] = useState('')
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    setErrorMsg(null)
    try {
      await ensureRegattaSession()

      // Idempotente: mantiene al día nombre/sede/fechas del espejo en
      // Regatta CR cada vez que se abre esta sección — no es una alta
      // separada, es la misma info que ya se guardó en "Información
      // general" de arriba.
      const { error: syncError } = await regatta.rpc('sync_kalai_event', {
        p_id: eventId,
        p_name: eventName,
        p_venue: venueName,
        p_starts_on: startDate,
        p_ends_on: endDate,
        p_max_race_courses: numRaceCourses,
      })
      if (syncError) throw syncError

      const [{ data: courseData, error: courseError }, { data: classData }] = await Promise.all([
        regatta
          .from('race_courses')
          .select('id, label, access_code, class_id, race_classes(label)')
          .eq('event_id', eventId)
          .order('created_at', { ascending: true }),
        regatta.from('race_classes').select('id, label').order('label'),
      ])
      if (courseError) throw courseError

      setCourses((courseData as unknown as RaceCourseRow[]) ?? [])
      setClasses(classData ?? [])
      setClassId((prev) => prev || classData?.[0]?.id || '')
      setState('ready')
    } catch (err) {
      setErrorMsg(extractErrorMessage(err))
      setState('error')
    }
  }, [eventId, eventName, venueName, startDate, endDate, numRaceCourses])

  useEffect(() => {
    load()
  }, [load])

  async function handleAddCourse(e: React.FormEvent) {
    e.preventDefault()
    if (!classId) return
    setErrorMsg(null)
    setCreating(true)
    const {
      data: { user },
    } = await regatta.auth.getUser()
    const classLabel = classes.find((c) => c.id === classId)?.label ?? classId
    const { error } = await regatta.from('race_courses').insert({
      event_id: eventId,
      class_id: classId,
      label: label.trim() || `Cancha ${classLabel}`,
      created_by: user!.id,
    })
    setCreating(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setLabel('')
    await load()
  }

  async function copyCode(courseId: string, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedId(courseId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // el código igual queda visible en pantalla para copiar a mano.
    }
  }

  return (
    <div className="card">
      <div className="rowBetween">
        <div className="sectionTitle">Canchas de regata</div>
        {numRaceCourses != null && <span className="badge">límite {numRaceCourses}</span>}
      </div>

      {state === 'loading' && <div className="subtitle">Conectando con Regatta CR…</div>}
      {state === 'error' && (
        <>
          <div className="error">{errorMsg}</div>
          <button className="button buttonSecondary" onClick={load}>
            Reintentar
          </button>
        </>
      )}

      {state === 'ready' && (
        <>
          {courses.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {courses.map((c) => (
                <div key={c.id} className="memberRow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="rowBetween">
                    <span style={{ fontWeight: 600 }}>{c.label}</span>
                    <span className="badge">{c.race_classes?.label}</span>
                  </div>
                  {c.access_code && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="code">{c.access_code}</span>
                      <button
                        className="link"
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={() => copyCode(c.id, c.access_code!)}
                      >
                        {copiedId === c.id ? '¡Copiado!' : 'Copiar código'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="subtitle">Todavía no hay canchas en este evento.</div>
          )}

          {canEdit && !locked && (
            <form onSubmit={handleAddCourse} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <div className="sectionTitle">Nueva cancha</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)} style={{ flex: 1 }}>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="Etiqueta (opcional, ej: Cancha A)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              {errorMsg && <div className="error">{errorMsg}</div>}
              <button className="button" type="submit" disabled={creating}>
                {creating ? 'Generando…' : 'Generar código'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
