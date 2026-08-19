'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { kalai } from '@/lib/supabase'
import { guessFieldMap, parseCsv, parseFlexibleDate } from '@/lib/csv'

export interface RosterFieldDef {
  key: string
  label: string
  required?: boolean
  type?: 'text' | 'date'
}

interface RosterSectionProps {
  title: string
  table: 'event_entrants' | 'event_coaches'
  eventId: string
  userId: string
  canEdit: boolean
  locked: boolean
  fields: RosterFieldDef[]
  aliases: Record<string, string[]>
  emptyMessage: string
  onCountChange?: (count: number) => void
  extraBanner?: React.ReactNode
}

type Row = Record<string, string | null> & { id: string }

const IGNORE = '__ignore__'

export default function RosterSection({
  title,
  table,
  eventId,
  userId,
  canEdit,
  locked,
  fields,
  aliases,
  emptyMessage,
  onCountChange,
  extraBanner,
}: RosterSectionProps) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [manualValues, setManualValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null)
  const [csvRows, setCsvRows] = useState<string[][] | null>(null)
  const [columnMap, setColumnMap] = useState<Record<number, string>>({})
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await kalai.from(table).select('*').eq('event_id', eventId).order('created_at', { ascending: true })
    const typed = (data ?? []) as Row[]
    setRows(typed)
    onCountChange?.(typed.length)
  }, [table, eventId, onCountChange])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (!rows) return []
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((r) => fields.some((f) => (r[f.key] ?? '').toString().toLowerCase().includes(q)))
  }, [rows, search, fields])

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const requiredMissing = fields.find((f) => f.required && !manualValues[f.key]?.trim())
    if (requiredMissing) {
      setErrorMsg(`Falta "${requiredMissing.label}".`)
      return
    }
    setSaving(true)
    const payload: Record<string, string> = { event_id: eventId, created_by: userId }
    for (const f of fields) {
      const v = manualValues[f.key]?.trim()
      if (v) payload[f.key] = v
    }
    const { error } = await kalai.from(table).insert(payload)
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setManualValues({})
    await load()
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar esta fila?')) return
    const { error } = await kalai.from(table).delete().eq('id', id)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await load()
  }

  async function handleFile(file: File) {
    const text = await file.text()
    const { headers, rows: parsedRows } = parseCsv(text)
    setCsvHeaders(headers)
    setCsvRows(parsedRows)
    const aliasesByField: Record<string, string[]> = {}
    for (const f of fields) aliasesByField[f.key] = aliases[f.key] ?? [f.label]
    setColumnMap(guessFieldMap(headers, aliasesByField))
    setImportMsg(null)
  }

  async function handleConfirmImport() {
    if (!csvHeaders || !csvRows) return
    const mappedFields = Object.values(columnMap)
    const requiredMissing = fields.find((f) => f.required && !mappedFields.includes(f.key))
    if (requiredMissing) {
      setImportMsg(`Falta mapear "${requiredMissing.label}" a alguna columna.`)
      return
    }
    setImporting(true)
    setImportMsg(null)
    let skippedDates = 0
    const payloads: Record<string, string>[] = []
    for (const csvRow of csvRows) {
      const payload: Record<string, string> = { event_id: eventId, created_by: userId }
      let hasAny = false
      for (const [colIndexStr, fieldKey] of Object.entries(columnMap)) {
        if (fieldKey === IGNORE) continue
        const colIndex = Number(colIndexStr)
        const raw = (csvRow[colIndex] ?? '').trim()
        if (!raw) continue
        const fieldDef = fields.find((f) => f.key === fieldKey)
        if (fieldDef?.type === 'date') {
          const parsed = parseFlexibleDate(raw)
          if (!parsed) {
            skippedDates++
            continue
          }
          payload[fieldKey] = parsed
        } else {
          payload[fieldKey] = raw
        }
        hasAny = true
      }
      if (hasAny && payload.full_name) payloads.push(payload)
    }

    let inserted = 0
    const chunkSize = 200
    for (let i = 0; i < payloads.length; i += chunkSize) {
      const chunk = payloads.slice(i, i + chunkSize)
      const { error } = await kalai.from(table).insert(chunk)
      if (error) {
        setImportMsg(`Se importaron ${inserted} filas, después falló: ${error.message}`)
        setImporting(false)
        await load()
        return
      }
      inserted += chunk.length
    }
    setImporting(false)
    setImportMsg(
      `Importadas ${inserted} filas.` + (skippedDates > 0 ? ` ${skippedDates} fechas no reconocidas se dejaron vacías.` : ''),
    )
    setCsvHeaders(null)
    setCsvRows(null)
    await load()
  }

  return (
    <div className="card">
      <div className="rowBetween">
        <div className="sectionTitle">{title}</div>
        {canEdit && !locked && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="link"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => {
                setShowImport((v) => !v)
                setShowAdd(false)
              }}
            >
              {showImport ? 'Cancelar' : 'Importar CSV'}
            </button>
            <button
              className="link"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => {
                setShowAdd((v) => !v)
                setShowImport(false)
              }}
            >
              {showAdd ? 'Cancelar' : '+ Agregar'}
            </button>
          </div>
        )}
      </div>

      {extraBanner}

      {rows === null ? (
        <div className="subtitle">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="subtitle">{emptyMessage}</div>
      ) : (
        <>
          <input
            className="input"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {filtered.length} de {rows.length}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filtered.map((r) => (
              <div key={r.id} className="memberRow">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{r.full_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {fields
                      .filter((f) => f.key !== 'full_name' && r[f.key])
                      .map((f) => r[f.key])
                      .join(' · ')}
                  </span>
                </div>
                {canEdit && !locked && (
                  <button
                    className="link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }}
                    onClick={() => handleDelete(r.id)}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {showAdd && canEdit && !locked && (
        <form onSubmit={handleAddManual} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fields.map((f) => (
              <div key={f.key}>
                <div className="label">
                  {f.label}
                  {f.required ? ' *' : ''}
                </div>
                <input
                  className="input"
                  type={f.type === 'date' ? 'date' : 'text'}
                  value={manualValues[f.key] ?? ''}
                  onChange={(e) => setManualValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {errorMsg && <div className="error">{errorMsg}</div>}
          <button className="button" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
      )}

      {showImport && canEdit && !locked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {!csvHeaders && (
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          )}
          {csvHeaders && csvRows && (
            <>
              <div className="subtitle">
                {csvRows.length} filas detectadas. Confirmá a qué campo corresponde cada columna del CSV.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {csvHeaders.map((h, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{h || `Columna ${i + 1}`}</div>
                    <select
                      className="select"
                      style={{ flex: 1 }}
                      value={columnMap[i] ?? IGNORE}
                      onChange={(e) => setColumnMap((m) => ({ ...m, [i]: e.target.value }))}
                    >
                      <option value={IGNORE}>Ignorar</option>
                      {fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="subtitle">Vista previa (primeras 3 filas):</div>
              <div className="code" style={{ whiteSpace: 'pre-wrap' }}>
                {csvRows.slice(0, 3).map((r, ri) => (
                  <div key={ri}>
                    {fields
                      .filter((f) => Object.values(columnMap).includes(f.key))
                      .map((f) => {
                        const colIndex = Number(Object.keys(columnMap).find((k) => columnMap[Number(k)] === f.key))
                        return `${f.label}: ${r[colIndex] ?? ''}`
                      })
                      .join(' | ')}
                  </div>
                ))}
              </div>
              {importMsg && <div className={importMsg.startsWith('Importadas') ? 'success' : 'error'}>{importMsg}</div>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="button" onClick={handleConfirmImport} disabled={importing}>
                  {importing ? 'Importando…' : `Importar ${csvRows.length} filas`}
                </button>
                <button
                  className="button buttonSecondary"
                  onClick={() => {
                    setCsvHeaders(null)
                    setCsvRows(null)
                    setImportMsg(null)
                  }}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
