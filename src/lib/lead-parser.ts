/**
 * lead-parser.ts — Template-driven lead data extractor
 *
 * Works with ANY industry: the BotField[] config tells it what to look for.
 * Users define fields via industry templates (wedding_decor, rental, clinic, shop, generic).
 *
 * Two field types affect extraction:
 *  - 'keyword': matches keywords in text → maps to a specific value
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
  // 1. Nama: Reynaldi OR nama saya Budi OR nama: Budi
  /(?:^|\n)(?:1[.)]\s*|nama\s*[:=-]\s*)([A-Za-z][A-Za-z\s'-]{1,30})/i,
  /nama\s*(?:saya|aku)?\s*:?\s+([A-Za-z][A-Za-z\s'-]{1,25})/i,
  // 2. saya + name (first capitalized word after "saya/aku")
  /(?:saya|aku|namaku|gw|gue)\s+([A-Z][a-zA-Z'-]{1,25})/,
  // 3. with/perkenalkan + name
  /(?:dengan|perkenalkan)\s+([A-Z][a-zA-Z'-]{1,25})/i,
]

const NAME_STOP_WORDS = [
  'mau', 'tanya', 'buka', 'booking', 'saya', 'adalah',
  'untuk', 'dengan', 'yang', 'dari', 'ke', 'di', 'dan', 'atau', 'ini', 'itu',
  'bagaimana', 'gimana', 'kenapa', 'kapan', 'dimana', 'siapa',
]

const LOCATIONS = [
  'jakarta', 'bandung', 'surabaya', 'bekasi', 'tangerang', 'depok',
  'bogor', 'semarang', 'yogyakarta', 'jogja', 'malang', 'solo',
  'medan', 'makassar', 'bali', 'denpasar', 'palembang', 'batam',
  'pekanbaru', 'manado', 'cibubur', 'bsd', 'serpong',
  'pondok indah', 'kelapa gading', 'pik', 'kemang', 'cilandak',
  'menteng', 'senayan', 'kuningan', 'sudirman',
]

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
      if (!field.keywords) return undefined
      for (const [value, keywords] of Object.entries(field.keywords)) {
        if (keywords.some(k => lower.includes(k.toLowerCase()))) {
          return value
        }
      }
      return undefined
    }

    case 'select': {
      if (!field.options) return undefined
      for (const opt of field.options) {
        if (lower.includes(opt.toLowerCase())) {
          return opt
        }
      }
      return undefined
    }

    case 'date': {
      return parseIndonesianDate(text)
    }

    case 'location': {
      for (const loc of LOCATIONS) {
        if (lower.includes(loc)) {
          return loc.replace(/\b\w/g, c => c.toUpperCase())
        }
      }
      return undefined
    }

    case 'text': {
      // Name extraction (special case: "text" field with key "name" or "contact_name")
      if (field.key === 'name' || field.key === 'contact_name') {
        for (const pat of NAME_PATTERNS) {
          const m = text.match(pat)
          if (m) {
            const raw = m[1].trim()
            // Take only the first word or first two words (not the whole greedy match)
            const firstWord = raw.split(/[\s,]+/)[0]
            const twoWords = raw.split(/[\s,]+/, 2).join(' ')
            // Check both 1-word and 2-word versions
            const candidates = [twoWords, firstWord].filter(c => c.length >= 2)
            for (const candidate of candidates) {
              if (!NAME_STOP_WORDS.some(sw => candidate.toLowerCase() === sw)) {
                return candidate.replace(/\b\w/g, c => c.toUpperCase())
              }
            }
          }
        }
        return undefined
      }
      // Generic text: try label match pattern, or return raw text if short
      if (text.length <= 80) return text.trim()
      return undefined
    }

    default:
      return undefined
  }
}

/**
 * Check if a message is a pure greeting (no data content).
 * Uses all fields to know what context words to look for.
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
    if ((field.key === 'name' || field.key === 'contact_name') && NAME_PATTERNS.some(p => p.test(text))) return false
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
 * Merges all user messages, then current message (highest priority).
 */
export function accumulateLeadData(
  messages: Array<{ role: string; content: string }>,
  currentMessage: string,
  fields: BotField[],
  existingData: Record<string, string> = {},
): LeadData {
  const accumulated: Record<string, string> = { ...existingData }

  // Scan history
  for (const msg of messages) {
    if (msg.role === 'user' && msg.content) {
      const partial = extractFromText(msg.content, fields)
      for (const [k, v] of Object.entries(partial)) {
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
      // only fill default if at least "name" and one other required field is present
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
