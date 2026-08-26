/**
 * lead-parser.ts — Template-driven lead data extractor with Typo Detection & Fuzzy Matching
 *
 * Works with ANY industry: the BotField[] config tells it what to look for.
 * Users define fields via industry templates (wedding_decor, rental, clinic, shop, generic).
 *
 * Two field types affect extraction:
 *  - 'keyword': matches keywords in text (with Levenshtein fuzzy typo tolerance)
 *    e.g. field "event_type" with keywords: { Wedding: ["nikah", "wedding"], Engagement: ["lamaran"] }
 *  - 'text': extracts freeform text using regex patterns
 *  - 'date': extracts Indonesian dates
 *  - 'location': matches city/area names
 *  - 'select': detects if text matches one of the options
 */

import type { BotField } from './db'

// ─── Indonesian date parser ───

const MONTH_NAMES: Record<string, number> = {
  'januari': 1, 'jan': 1,
  'februari': 2, 'feb': 2,
  'maret': 3, 'mar': 3,
  'april': 4, 'apr': 4,
  'mei': 5,
  'juni': 6, 'jun': 6,
  'juli': 7, 'jul': 7,
  'agustus': 8, 'agus': 8,
  'september': 9, 'sep': 9,
  'oktober': 10, 'okt': 10,
  'november': 11, 'nov': 11,
  'desember': 12, 'des': 12,
}

const GREETING_WORDS = [
  'halo', 'hi', 'hello', 'hay', 'hey', 'pagi', 'siang', 'sore',
  'malam', 'selamat', 'permisi', 'assalam', 'min', 'kak', 'p', 'hai',
  'bro', 'sis', 'mimin',
]

const NAME_PATTERNS = [
  // 1. WhatsApp form copy-paste / label matching: "👤 *Nama* (wajib) _(Nama lengkap)_: Claudia", "*Nama*: Claudia"
  /(?:^|\n)\s*(?:[^\w\n\r*]{0,4}\s*)?(?:\d+[.)]\s*)?\*?nama(?:\s*lengkap)?\b[^\n\r:=]*[:=-]\s*([^\n\r]{1,40})/i,
  
  // 2. atas nama / a.n / a/n
  /(?:atas\s+nama|a[./]n)\s*:?\s*([^\n\r]{1,40})/i,

  // 3. nama saya / namaku / saya / aku
  /(?:nama\s*(?:saya|aku)?|namaku)\s*:?\s+([^\n\r]{1,40})/i,
  /(?:saya|aku|namaku|gw|gue)\s+([A-Za-z'-]{2,25}(?:\s+[A-Za-z'-]{2,25}){0,2})/i,

  // 4. dengan / perkenalkan / call me
  /(?:dengan|perkenalkan)\s+([A-Za-z'-]{2,25}(?:\s+[A-Za-z'-]{2,25}){0,2})/i,

  // 5. 1. Claudia (Numbered list format without "nama" label)
  /(?:^|\n)\s*1[.)]\s*([A-Za-z'-]{2,25}(?:\s+[A-Za-z'-]{2,25}){0,2})/i,

  // 6. 👤 Claudia (Emoji bullet without label)
  /(?:^|\n)\s*👤\s*([A-Za-z'-]{2,25}(?:\s+[A-Za-z'-]{2,25}){0,2})/i,
]

const NAME_STOP_WORDS = [
  'mau', 'tanya', 'buka', 'booking', 'saya', 'adalah',
  'untuk', 'dengan', 'yang', 'dari', 'ke', 'di', 'dan', 'atau', 'ini', 'itu',
  'bagaimana', 'gimana', 'kenapa', 'kapan', 'dimana', 'siapa',
  'tanggal', 'tgl', 'jenis', 'acara', 'lokasi', 'tempat', 'venue',
  'alamat', 'hp', 'wa', 'telepon', 'email', 'nomor', 'pesanan',
  'budget', 'harga', 'pembayaran', 'keterangan', 'catatan', 'item', 'produk',
  'kak', 'kakak', 'min', 'mimin', 'mas', 'mbak', 'om', 'tante', 'sis', 'bro', 'pak', 'bu',
  'halo', 'hai', 'pagi', 'siang', 'sore', 'malam', 'terima', 'makasih', 'info', 'infonya',
  'ya', 'dong', 'sih', 'nih', 'oke', 'ok', 'sip', 'siap', 'wajib', 'opsional',
  'dekor', 'dekorasi', 'pl', 'pricelist', 'katalog', 'paket', 'sewa', 'rental',
  'lengkap', 'contoh'
]

const LOCATIONS = [
  'jakarta', 'bandung', 'surabaya', 'bekasi', 'tangerang', 'depok',
  'bogor', 'semarang', 'yogyakarta', 'jogja', 'malang', 'solo',
  'medan', 'makassar', 'bali', 'denpasar', 'palembang', 'batam',
  'pekanbaru', 'manado', 'cibubur', 'bsd', 'serpong',
  'pondok indah', 'kelapa gading', 'pik', 'kemang', 'cilandak',
  'menteng', 'senayan', 'kuningan', 'sudirman',
]

// ─── Helper: Escape Regex ───
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Checks if the message text contains an explicit form line corresponding to field.label or field.key,
 * e.g. "👤 *Nama* (wajib) _(Nama lengkap)_: Claudia"
 *      "💒 *Jenis Acara* (wajib) _(Wedding / Lamaran)_: Wedding"
 *      "🏛️ *Tempat / Venue* (wajib) _(Gedung / Rumah)_: Rumah"
 *      "📅 *Tanggal Acara* (opsional) _(contoh: 20 Oktober 2026)_: 19 Oktober 2026"
 */
function extractExplicitFormLine(text: string, field: BotField): string | undefined {
  const labelLower = field.label.toLowerCase()
  const keyLower = field.key.toLowerCase().replace(/_/g, ' ')
  const labelWords = field.label.toLowerCase().split(/[\s/()]+/).filter(w => w.length >= 3)

  // Line-by-line check using the last outer colon/equal separator
  const lines = text.split(/[\n\r]+/)
  for (const line of lines) {
    const lastColonIdx = line.lastIndexOf(':')
    const lastEqualsIdx = line.lastIndexOf('=')
    const splitIdx = Math.max(lastColonIdx, lastEqualsIdx)

    if (splitIdx > 0) {
      const leftPart = line.substring(0, splitIdx).toLowerCase()
      const rightPart = line.substring(splitIdx + 1).trim()

      const isMatch =
        leftPart.includes(labelLower) ||
        leftPart.includes(keyLower) ||
        (labelWords.length > 0 && labelWords.some(w => leftPart.includes(w)))

      if (isMatch && rightPart.length > 0) {
        return rightPart
      }
    }
  }

  const labelEscaped = escapeRegex(field.label)
  const keyEscaped = escapeRegex(field.key.replace(/_/g, ' '))
  const labelWordPattern = labelWords.map(escapeRegex).join('|')

  // Fallback regex pattern matching
  const patterns = [
    new RegExp(
      `(?:^|\\n)\\s*(?:[^\\w\\n\\r*]{0,4}\\s*)?(?:\\d+[.)]\\s*)?\\*?(?:${labelEscaped}|${labelWordPattern})\\b.*?(?::|=|\\s-\\s)\\s*([^\\n\\r]+)`,
      'i'
    ),
    new RegExp(
      `(?:^|\\n)\\s*(?:[^\\w\\n\\r*]{0,4}\\s*)?(?:\\d+[.)]\\s*)?\\*?${keyEscaped}\\b.*?(?::|=|\\s-\\s)\\s*([^\\n\\r]+)`,
      'i'
    ),
  ]

  for (const pat of patterns) {
    const m = text.match(pat)
    if (m && m[1]) {
      const val = m[1].trim()
      if (val.length > 0) return val
    }
  }
  return undefined
}

/**
 * Clean and format person name, stripping emojis and stop words
 */
function cleanExtractedName(raw: string): string | undefined {
  const firstPart = raw.split(/[\n\r:,]/)[0].trim()

  const words = firstPart.split(/\s+/).filter(w => {
    const cleanW = w.toLowerCase().replace(/[^a-z]/g, '')
    return cleanW.length >= 2 && !NAME_STOP_WORDS.includes(cleanW)
  })

  if (words.length > 0) {
    const cleanName = words.slice(0, 3).join(' ')
    return cleanName.replace(/\b\w/g, c => c.toUpperCase())
  }
  return undefined
}

// ─── Lightweight Levenshtein Distance for Typo Detection ───

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }
  return matrix[a.length][b.length]
}

/**
 * Fuzzy check if text word matches target keyword (tolerating typos)
 * e.g. "Engagnment" -> matches "Engagement"
 */
function isFuzzyMatch(textWord: string, targetKeyword: string): boolean {
  const w = textWord.toLowerCase().trim()
  const k = targetKeyword.toLowerCase().trim()

  if (w === k || w.includes(k) || k.includes(w)) return true

  // Apply Levenshtein fuzzy matching for words >= 4 characters
  if (w.length >= 4 && k.length >= 4) {
    const maxLen = Math.max(w.length, k.length)
    const dist = levenshteinDistance(w, k)
    // Allow up to 2 typos for words >= 6 chars, or 1 typo for words 4-5 chars
    const maxAllowedDist = maxLen >= 6 ? 2 : 1
    if (dist <= maxAllowedDist) return true
  }
  return false
}

// ─── Core extraction ───

export interface LeadData {
  field_values: Record<string, string>   // { field_key: extracted_value }
  is_complete: boolean                   // all required fields filled
  missing_fields: string[]               // list of missing required field keys
}

/**
 * Extract one field's value from a single message text.
 */
function extractFieldValue(text: string, field: BotField): string | undefined {
  const lower = text.toLowerCase()

  switch (field.type) {
    case 'keyword': {
      let keywordsMap = field.keywords
      if (!keywordsMap || Object.keys(keywordsMap).length === 0) {
        if (field.placeholder) {
          const parts = field.placeholder.split(/[\/,|]+/).map(p => p.trim()).filter(Boolean)
          if (parts.length > 0) {
            keywordsMap = {}
            for (const p of parts) {
              keywordsMap[p] = [p.toLowerCase()]
            }
          }
        }
      }
      if (!keywordsMap) return undefined
      
      const explicit = extractExplicitFormLine(text, field)
      const targetText = explicit ? explicit.toLowerCase() : lower
      const words = targetText.split(/[\s:,\-._/\n\r]+/).filter(w => w.length >= 3)

      for (const [value, keywords] of Object.entries(keywordsMap)) {
        // 1. Direct substring match
        if (keywords.some(k => targetText.includes(k.toLowerCase()))) {
          return value
        }
        // 2. Typo-tolerant Fuzzy match word-by-word against keywords
        for (const kw of keywords) {
          if (words.some(word => isFuzzyMatch(word, kw))) {
            return value
          }
        }
      }

      // If explicit line didn't yield a match, fallback to searching the whole message
      if (explicit) {
        const allWords = lower.split(/[\s:,\-._/\n\r]+/).filter(w => w.length >= 3)
        for (const [value, keywords] of Object.entries(keywordsMap)) {
          if (keywords.some(k => lower.includes(k.toLowerCase()))) {
            return value
          }
          for (const kw of keywords) {
            if (allWords.some(word => isFuzzyMatch(word, kw))) {
              return value
            }
          }
        }
      }
      return undefined
    }

    case 'select': {
      let optionsList = field.options
      if (!optionsList || optionsList.length === 0) {
        if (field.placeholder) {
          optionsList = field.placeholder.split(/[\/,|]+/).map(p => p.trim()).filter(Boolean)
        }
      }
      if (!optionsList || optionsList.length === 0) return undefined
      const explicit = extractExplicitFormLine(text, field)
      const targetText = explicit ? explicit.toLowerCase() : lower
      for (const opt of optionsList) {
        if (targetText.includes(opt.toLowerCase())) {
          return opt
        }
      }
      if (explicit) {
        for (const opt of optionsList) {
          if (lower.includes(opt.toLowerCase())) {
            return opt
          }
        }
      }
      return undefined
    }

    case 'date': {
      const explicit = extractExplicitFormLine(text, field)
      if (explicit) {
        const parsed = parseIndonesianDate(explicit)
        if (parsed) return parsed
      }
      return parseIndonesianDate(text)
    }

    case 'location': {
      const explicit = extractExplicitFormLine(text, field)
      const targetText = explicit ? explicit.toLowerCase() : lower
      for (const loc of LOCATIONS) {
        if (targetText.includes(loc)) {
          return loc.replace(/\b\w/g, c => c.toUpperCase())
        }
      }
      if (explicit) {
        for (const loc of LOCATIONS) {
          if (lower.includes(loc)) {
            return loc.replace(/\b\w/g, c => c.toUpperCase())
          }
        }
        if (explicit.length >= 3 && explicit.length <= 60) {
          return explicit.replace(/\b\w/g, c => c.toUpperCase())
        }
      }
      return undefined
    }

    case 'text': {
      // Name extraction (special case: "text" field with key "name" or "contact_name")
      if (field.key === 'name' || field.key === 'contact_name') {
        // 1. Check explicit form line first (e.g. "👤 Nama (wajib): Claudia")
        const explicit = extractExplicitFormLine(text, field)
        if (explicit) {
          const cleaned = cleanExtractedName(explicit)
          if (cleaned) return cleaned
        }

        // 2. Check regex patterns
        for (const pat of NAME_PATTERNS) {
          const m = text.match(pat)
          if (m && m[1]) {
            const cleaned = cleanExtractedName(m[1])
            if (cleaned) return cleaned
          }
        }

        // 3. Freeform line-by-line check (e.g. "Claudia\nWedding\nSby" or standalone "claudia")
        const trimmed = text.trim()
        const lines = trimmed.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)

        for (const line of lines) {
          // Skip if line contains numbers, colons, emojis, or is too long
          if (/\d/.test(line) || line.includes(':') || line.length > 35) continue
          
          // Skip if line contains greetings
          if (GREETING_WORDS.some(gw => line.toLowerCase().includes(gw))) continue
          
          // Skip if line parses as date
          if (parseIndonesianDate(line)) continue
          
          // Skip if line matches city location
          if (LOCATIONS.some(loc => line.toLowerCase().includes(loc))) continue

          const cleaned = cleanExtractedName(line)
          if (cleaned) return cleaned
        }

        return undefined
      }

      // Generic text field:
      const explicit = extractExplicitFormLine(text, field)
      if (explicit) return explicit.trim()
      if (text.length <= 80 && !text.includes('\n')) return text.trim()
      return undefined
    }

    default:
      return undefined
  }
}

/**
 * Check if a message is a pure greeting (no data content).
 */
export function isGreeting(text: string, fields: BotField[]): boolean {
  const lower = text.toLowerCase().trim()
  const hasGreeting = GREETING_WORDS.some(gw => lower.includes(gw))
  if (!hasGreeting || lower.length > 80) return false

  // Check if message contains any field-relevant keywords
  for (const field of fields) {
    if (field.type === 'keyword' && field.keywords) {
      for (const keywords of Object.values(field.keywords)) {
        if (keywords.some(k => lower.includes(k.toLowerCase()))) return false
      }
    }
    if (field.type === 'date' && /\d/.test(text) && lower.length > 10) return false
    if ((field.key === 'name' || field.key === 'contact_name') && (NAME_PATTERNS.some(p => p.test(text)) || extractExplicitFormLine(text, field))) return false
  }
  return true
}

/**
 * Extract all fields from a single message.
 */
export function extractFromText(text: string, fields: BotField[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const field of fields) {
    const val = extractFieldValue(text, field)
    if (val) result[field.key] = val
  }
  return result
}

/**
 * Accumulate lead data from conversation history + existing DB data.
 */
export function accumulateLeadData(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
  fields: BotField[],
  existingData: Record<string, string> = {},
): LeadData {
  const accumulated: Record<string, string> = { ...existingData }

  // Extract backwards from history (older to newer)
  for (const item of history) {
    if (item.role === 'user' && item.content) {
      const extracted = extractFromText(item.content, fields)
      for (const [k, v] of Object.entries(extracted)) {
        if (v) accumulated[k] = v
      }
    }
  }

  // Current message (highest priority)
  const current = extractFromText(currentMessage, fields)
  for (const [k, v] of Object.entries(current)) {
    if (v) accumulated[k] = v
  }

  // Apply defaults for missing fields that have default_value
  for (const field of fields) {
    if (!accumulated[field.key] && field.default_value) {
      const nameKey = fields.find(f => f.key === 'name' || f.key === 'contact_name')?.key
      const hasName = nameKey ? !!accumulated[nameKey] : true
      const requiredKeys = fields.filter(f => f.required && f.key !== nameKey).map(f => f.key)
      const hasAnyRequired = requiredKeys.some(k => !!accumulated[k])
      if (hasName && hasAnyRequired) {
        accumulated[field.key] = field.default_value
      }
    }
  }

  // Determine package: join of all "select"/"keyword" field values
  const selectValues = fields
    .filter(f => (f.type === 'keyword' || f.type === 'select') && accumulated[f.key])
    .map(f => accumulated[f.key])
  const pkg = selectValues.length > 0 ? selectValues.join(' + ') : undefined
  if (pkg) accumulated._package = pkg

  // Check completeness
  const missing_fields = fields
    .filter(f => f.required && !accumulated[f.key])
    .map(f => f.key)
  const is_complete = missing_fields.length === 0

  return { field_values: accumulated, is_complete, missing_fields }
}

// ─── Date parser ───

function parseIndonesianDate(text: string): string | undefined {
  const lower = text.toLowerCase()

  const isoMatch = lower.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
    if (!isNaN(d.getTime())) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  }

  const slashMatch = lower.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (slashMatch) {
    const d = new Date(parseInt(slashMatch[3]), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]))
    if (!isNaN(d.getTime())) return `${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`
  }

  for (const [monthName, monthNum] of Object.entries(MONTH_NAMES)) {
    const pattern = new RegExp(`(\\d{1,2})\\s+${monthName}(\\s+(\\d{4}))?`)
    const m = lower.match(pattern)
    if (m) {
      const day = parseInt(m[1])
      const year = m[3] ? parseInt(m[3]) : new Date().getFullYear()
      const d = new Date(year, monthNum - 1, day)
      if (!isNaN(d.getTime())) {
        return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
  }

  return undefined
}
