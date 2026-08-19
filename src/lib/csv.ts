// Parser de CSV chico y a mano — sin dependencia nueva, el formato real
// (ver "Inscriptos Optimist Timo.csv" del club) es plano, sin celdas con
// saltos de línea. Soporta comillas y detecta ',' vs ';' por el header.
function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length
  const semicolons = (headerLine.match(/;/g) || []).length
  return semicolons > commas ? ';' : ','
}

function parseLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const cleaned = text.replace(/^﻿/, '')
  const lines = cleaned.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const delimiter = detectDelimiter(lines[0])
  const headers = parseLine(lines[0], delimiter)
  const rows = lines.slice(1).map((l) => parseLine(l, delimiter))
  return { headers, rows }
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function guessFieldMap(headers: string[], aliasesByField: Record<string, string[]>): Record<number, string> {
  const map: Record<number, string> = {}
  headers.forEach((h, i) => {
    const n = normalize(h)
    for (const [field, aliases] of Object.entries(aliasesByField)) {
      if (aliases.some((a) => normalize(a) === n)) {
        map[i] = field
        return
      }
    }
  })
  return map
}

// Acepta YYYY-MM-DD (ya normalizado) o DD/MM/YYYY (formato común de
// planillas argentinas). Cualquier otra cosa se descarta (null) en vez
// de guardar una fecha incorrecta.
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}
