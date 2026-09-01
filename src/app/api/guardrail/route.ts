import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/guardrail — Chatin Guardrail Layer v2 (Hybrid: Rule + LLM)
 *
 * Validates draft replies from chat-engine before sending to customer.
 *
 * Layer 1 (rule-based, 0ms, free): 6 keyword/regex checks
 *   1. Cancel intent
 *   2. Admin handoff
 *   3. Off-topic questions
 *   4. Name false positive
 *   5. Repeat detection
 *   6. Entity acknowledgment
 *
 * Layer 2 (LLM context, ~1-2s, token cost): MiMo deep context check
 *   - Only runs if Layer 1 found nothing
 *   - Catches ambiguous cases: Javanese dialect as name,
 *     cancel intent hidden in slang, off-topic disguised in long sentences
 *   - 3s timeout, fallback valid=true (never block on LLM failure)
 *
 * PURE VALIDATION — does NOT send any WhatsApp messages.
 */

// ─── LLM config ───
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'http://154.26.131.186:20128/v1'
const MIMO_API_KEY = process.env.MIMO_API_KEY || ''
const MIMO_MODEL = process.env.MIMO_MODEL || 'MIMO'
const LLM_TIMEOUT_MS = 3000

// ─── Dialect / slang keyword maps ───
const DIALECT_KEYWORDS: Record<string, Record<string, string[]>> = {
  event_type: {
    Wedding: [
      'nikah', 'wedding', 'resepsi', 'akad', 'menikah', 'pernikahan',
      'rabi', 'rabine', 'nikahan', 'nikahane', 'manten', 'mantenan',
      'walimah', 'walimatul', 'pemberkatan', 'matrimony', 'ijab',
      'unduh mantu', 'ngunduh mantu', 'intimate wedding',
    ],
    Engagement: [
      'lamaran', 'engagement', 'tunangan', 'melamar', 'siraman',
      'tingjing', 'sangjit', 'teapai', 'tea pai', 'seserahan',
      'hantaran', 'midodareni', 'pengajian', 'bridal shower',
    ],
  },
  venue_type: {
    Gedung: [
      'gedung', 'hotel', 'hall', 'ballroom', 'masjid', 'resto',
      'restoran', 'cafe', 'kafe', 'convention', 'aula', 'villa',
      'palace', 'resort', 'clubhouse', 'indoor', 'gallery',
    ],
    Rumah: [
      'rumah', 'halaman', 'garasi', 'home', 'kediaman', 'outdoor',
      'taman', 'garden', 'pool', 'poolside', 'rooftop', 'pantai',
      'beach', 'kebun', 'oma', 'omah', 'omahku', 'omahku dewe',
      'nang oma', 'nang omah', 'sing omah', 'grahan', 'papan',
    ],
  },
}

// ─── Name extraction false-positive words ───
const NAME_FALSE_POSITIVES = new Set([
  'terimakasih', 'terimakasih2', 'terimakasihh', 'makasihh',
  'thanks', 'thank', 'thankyou', 'trims', 'trmksh',
  'baik', 'baiknya', 'baiklah', 'tentu', 'mohon', 'tolong',
  'bisa', 'belum', 'sudah', 'maaf', 'sorry', 'mantap',
  'keren', 'bagus', 'noted', 'done', 'skip', 'lanjut',
  'semua', 'nanti', 'sekarang', 'besok', 'kalo', 'kalau',
  'jadi', 'oke', 'ok', 'sip', 'siap', 'halo', 'hai',
  'pagi', 'siang', 'sore', 'malam', 'kak', 'min', 'admin',
  'info', 'tanya', 'harga', 'dong', 'ya', 'nih', 'sih',
  'dekor', 'dekorasi', 'wedding', 'nikah', 'lamaran',
  'gedung', 'rumah', 'rabi', 'oma', 'omah', 'candi',
  'sidoarjo', 'surabaya', 'malang', 'gresik', 'mojokerto',
])

// ─── Cancel / stop intent words ───
const CANCEL_PATTERNS = [
  'tidak jadi', 'gak jadi', 'ga jadi', 'nggak jadi', 'ngak jadi',
  'batal', 'cancel', 'skip', 'gajadi', 'gakjadi', 'tidakjadi',
  'udah gak', 'udah ga', 'sudah tidak', 'udah tidak',
  'stop', 'berhenti', 'cukup', 'udah cukup', 'selesai',
  'ga usah', 'gak usah', 'tidak usah', 'nggak usah',
  'ga perlu', 'gak perlu', 'tidak perlu',
]

// ─── Admin handoff trigger words ───
const ADMIN_HANDOFF_PATTERNS = [
  'admin', 'orang', 'cs', 'customer service', ' manusia',
  'bicara sama orang', 'mau tanya langsung', 'hubungkan admin',
  'sambungkan', 'transfer', 'bicara sama admin',
]

// ─── Common question patterns (off-topic from form flow) ───
const OFF_TOPIC_PATTERNS = [
  { pattern: /harga\s*(berapa|nya|an|dong|sih|kah)?/i, intent: 'ask_price' },
  { pattern: /biaya\s*(berapa|nya|an|dong)?/i, intent: 'ask_price' },
  { pattern: /berapa\s*(harga|biaya|tarif|ongkos|cost)/i, intent: 'ask_price' },
  { pattern: /lokasi\s*(dimana|mana|nya|dong)?/i, intent: 'ask_location' },
  { pattern: /alamat\s*(dimana|mana|nya|lengkap)?/i, intent: 'ask_location' },
  { pattern: /dimana\s*(alamat|lokasi|kantor|tempat)/i, intent: 'ask_location' },
  { pattern: /portofolio|portfolio|contoh\s*hasil|galeri/i, intent: 'ask_portfolio' },
  { pattern: /buka\s*(jam|hari|kapan)/i, intent: 'ask_hours' },
  { pattern: /jam\s*(berapa|operasional|buka|tutup)/i, intent: 'ask_hours' },
  { pattern: /kontak\s*(wa|whatsapp|hp|telepon|phone)/i, intent: 'ask_contact' },
  { pattern: /promo|diskon|potongan|cashback/i, intent: 'ask_promo' },
  { pattern: /dp|down\s*payment|cicilan|kredit|bayar\s*(gimana|bagaimana|dimana)/i, intent: 'ask_payment' },
]

interface GuardrailRequest {
  user_message: string
  draft_reply: string
  chat_history?: Array<{ role: string; content: string }>
  lead_data?: Record<string, string>
  bot_rules?: {
    business_name?: string
    fields?: Array<{ key: string; label: string; type: string; required: boolean; keywords?: Record<string, string[]> }>
    pricelist_links?: Record<string, string>
  }
}

interface GuardrailResponse {
  valid: boolean
  reason?: string
  corrected_reply?: string
  extracted_entities?: Record<string, string>
  intent?: string
  confidence?: number
}

function extractEntitiesFromMessage(message: string): Record<string, string> {
  const lower = message.toLowerCase()
  const entities: Record<string, string> = {}

  // Extract event_type
  for (const [value, keywords] of Object.entries(DIALECT_KEYWORDS.event_type)) {
    if (keywords.some(kw => lower.includes(kw))) {
      entities.event_type = value
      break
    }
  }

  // Extract venue_type
  for (const [value, keywords] of Object.entries(DIALECT_KEYWORDS.venue_type)) {
    if (keywords.some(kw => lower.includes(kw))) {
      entities.venue_type = value
      break
    }
  }

  // Extract date (Indonesian format)
  const monthMap: Record<string, string> = {
    januari: '01', februari: '02', maret: '03', april: '04',
    mei: '05', juni: '06', juli: '07', agustus: '08',
    september: '09', oktober: '10', november: '11', desember: '12',
    jan: '01', feb: '02', mar: '03', apr: '04',
    jun: '06', jul: '07', agu: '08', agus: '08',
    sep: '09', okt: '10', nov: '11', des: '12',
  }
  const dateMatch = lower.match(/(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agus|sep|okt|nov|des)\s*(\d{4})?/)
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0')
    const month = monthMap[dateMatch[2]] || '01'
    const year = dateMatch[3] || new Date().getFullYear().toString()
    entities.event_date = `${year}-${month}-${day}`
  }

  // Extract location (common Indonesian cities)
  const cities = [
    'jakarta', 'bandung', 'surabaya', 'bekasi', 'tangerang', 'depok',
    'bogor', 'semarang', 'yogyakarta', 'jogja', 'malang', 'solo',
    'sidoarjo', 'gresik', 'mojokerto', 'lamongan', 'tuban', 'bojonegoro',
    'bali', 'denpasar', 'medan', 'makassar', 'palembang', 'batam',
  ]
  for (const city of cities) {
    if (lower.includes(city)) {
      entities.location = city.charAt(0).toUpperCase() + city.slice(1)
      break
    }
  }

  return entities
}

function detectIntent(message: string): string {
  const lower = message.toLowerCase().trim()

  // Cancel intent
  if (CANCEL_PATTERNS.some(p => lower.includes(p))) return 'cancel'

  // Admin handoff
  if (ADMIN_HANDOFF_PATTERNS.some(p => lower.includes(p))) return 'admin_handoff'

  // Off-topic questions
  for (const { pattern, intent } of OFF_TOPIC_PATTERNS) {
    if (pattern.test(message)) return intent
  }

  // Greeting
  const greetingWords = ['halo', 'hi', 'hello', 'hai', 'hey', 'pagi', 'siang', 'sore', 'malam', 'selamat', 'permisi', 'assalam', 'p ']
  if (greetingWords.some(g => lower.startsWith(g) || lower === g)) return 'greeting'

  // Thank you / acknowledgment
  if (/^(ok|oke|sip|siap|baik|noted|terima\s*kasih|makasih|thanks|mantap|bagus|keren)/.test(lower)) return 'acknowledgment'

  // Providing data (has entities)
  const entities = extractEntitiesFromMessage(message)
  if (Object.keys(entities).length > 0) return 'providing_data'

  return 'unknown'
}

function isNameFalsePositive(name: string): boolean {
  if (!name) return false
  const clean = name.toLowerCase().replace(/[^a-z\s]/g, '').trim()
  const words = clean.split(/\s+/)
  // If ALL words are false positives, the name is invalid
  return words.every(w => NAME_FALSE_POSITIVES.has(w))
}

function isDraftRepeatingHistory(draft: string, history: Array<{ role: string; content: string }>): boolean {
  if (!history || history.length === 0) return false
  const recentBotMessages = history
    .filter(h => h.role === 'assistant' || h.role === 'bot')
    .slice(-3)
    .map(h => h.content.trim())

  // Check if draft is identical or very similar to any recent bot message
  return recentBotMessages.some(prev => {
    if (prev === draft) return true
    // Check if >70% overlap (simple similarity)
    const shorter = prev.length < draft.length ? prev : draft
    const longer = prev.length < draft.length ? draft : prev
    if (shorter.length < 20) return false
    return longer.includes(shorter.substring(0, Math.floor(shorter.length * 0.7)))
  })
}

function buildCorrectedReply(
  intent: string,
  entities: Record<string, string>,
  leadData: Record<string, string>,
  businessName: string,
  botRules?: GuardrailRequest['bot_rules'],
): string {
  const name = leadData?.name || leadData?.contact_name || ''

  switch (intent) {
    case 'cancel':
      return `Baik Kak, tidak apa-apa 😊\nKalau butuh info lagi nanti, silakan chat kembali ya!`

    case 'admin_handoff':
      return '' // empty = handover to admin

    case 'ask_price': {
      const links = botRules?.pricelist_links || {}
      const linkEntries = Object.entries(links).filter(([, url]) => Boolean(url))
      if (linkEntries.length > 0) {
        const [title, url] = linkEntries[0]
        return `Untuk info harga, Kakak bisa cek katalog kami di sini ya:\n📄 ${title}\n${url}\n\nAda yang ingin ditanyakan lagi? 😊`
      }
      return `Mohon maaf Kak, info harga lengkap akan dijelaskan oleh tim admin kami. Sebentar ya, akan kami hubungkan 😊`
    }

    case 'ask_location':
      return `Untuk lokasi dan alamat lengkap ${businessName}, akan diinfokan oleh tim admin kami ya Kak. Sebentar ya 😊`

    case 'ask_portfolio':
      return `Untuk portofolio dan contoh hasil karya ${businessName}, akan dikirimkan oleh tim admin kami ya Kak. Sebentar ya 😊`

    case 'ask_hours':
      return `Jam operasional ${businessName} akan diinfokan oleh tim admin kami ya Kak. Sebentar ya 😊`

    case 'ask_contact':
      return `Kakak sudah terhubung langsung dengan ${businessName} di sini. Ada yang bisa dibantu? 😊`

    case 'ask_promo':
      return `Info promo terbaru akan diinfokan oleh tim admin kami ya Kak. Sebentar ya 😊`

    case 'ask_payment':
      return `Info cara pembayaran dan DP akan dijelaskan oleh tim admin kami ya Kak. Sebentar ya 😊`

    case 'acknowledgment':
      return `Siap Kak! 😊 Kalau ada yang ditanyakan lagi, silakan ya.`

    default:
      return ''
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 2: LLM Context Check (fallback for ambiguous cases)
// ═══════════════════════════════════════════════════════════════

interface LlmValidationResult {
  valid: boolean
  reason: string
  corrected_reply: string
  intent: string
}

/**
 * Call MiMo LLM to check draft reply against conversation context.
 * Only called when Layer 1 (rule-based) found no issues.
 * Timeout: 3s. On failure, returns valid=true (never block).
 */
async function llmContextCheck(
  userMessage: string,
  draftReply: string,
  history: Array<{ role: string; content: string }>,
  leadData: Record<string, string>,
  botRules?: GuardrailRequest['bot_rules'],
): Promise<LlmValidationResult> {
  const businessName = botRules?.business_name || 'Bisnis Kami'
  const fields = botRules?.fields || []
  const fieldSummary = fields.map(f => `${f.key} (${f.label}, ${f.type}, ${f.required ? 'wajib' : 'opsional'})`).join(', ')
  const currentData = Object.entries(leadData).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ') || 'kosong'

  // Build compact history (last 5 messages max)
  const recentHistory = history.slice(-5).map(h => `${h.role}: ${h.content}`).join('\n')

  const systemPrompt = `Kamu adalah validator bot WhatsApp untuk ${businessName}.

TUGASMU: Cek apakah draft reply dari bot MASIH RELEVAN dengan konteks percakapan.

FIELD YANG DIKUMPULKAN: ${fieldSummary || 'name, event_type, venue_type, event_date'}
DATA SUDAH TEREKSTRACK: ${currentData}

RULE:
1. Jika user bilang "rabi", "nikah", "wedding", "lamaran" → itu DATA ACARA, BUKAN nama orang. Jangan izinkan bot memanggil user "Kak Rabi".
2. Jika user bilang "mantap", "bagus", "keren", "terimakasih", "ok" → itu ACKNOWLEDGMENT, bukan nama. Jangan izinkan bot memanggil user "Kak Mantap" dll.
3. Jika user bilang "tidak jadi", "batal", "udah gak", "skip", "cukup" → itu CANCEL. Draft harus ganti ke goodbye.
4. Jika user tanya harga/lokasi/biaya → draft harus redirect ke pricelist/admin, BUKAN lanjut form.
5. Jika draft meminta field yang SUDAH ADA di data → draft salah, harus akui data yang sudah ada dulu.
6. Jika user beri info baru (tanggal, kota, jenis acara) tapi draft tidak mengakuinya → draft harus acknowledge dulu.

CONTEXT IMPORTANT: Dialek Jawa: "rabi"=nikah, "oma/omah"=rumah, "nang oma ku dewe"=di rumah sendiri. BUKAN nama.

Response JSON SAJA (tanpa markdown):
{
  "valid": true/false,
  "reason": "alasan singkat",
  "corrected_reply": "reply yang benar (kosongkan jika valid=true atau mau handover ke admin)",
  "intent": "cancel|admin_handoff|providing_data|acknowledgment|greeting|unknown"
}`

  const userPrompt = `HISTORY PERCAKAPAN:
${recentHistory || '(percakapan baru, belum ada history)'}

USER MESSAGE: "${userMessage}"

LEAD DATA SAAT INI: ${currentData}

DRAFT REPLY DARI BOT: "${draftReply}"

Cek: Apakah draft reply ini RELEVAN dan TEPAT untuk konteks di atas?`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

    const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MIMO_API_KEY ? { 'Authorization': `Bearer ${MIMO_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      console.warn(`[guardrail] LLM returned ${res.status}, fallback to valid`)
      return { valid: true, reason: '', corrected_reply: '', intent: '' }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''

    // Parse JSON from LLM response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[guardrail] LLM response not JSON, fallback to valid')
      return { valid: true, reason: '', corrected_reply: '', intent: '' }
    }

    const parsed = JSON.parse(jsonMatch[0])
    return {
      valid: parsed.valid === true,
      reason: parsed.reason || '',
      corrected_reply: parsed.corrected_reply || '',
      intent: parsed.intent || '',
    }

  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[guardrail] LLM timeout (3s), fallback to valid')
    } else {
      console.warn('[guardrail] LLM error, fallback to valid:', err instanceof Error ? err.message : err)
    }
    return { valid: true, reason: '', corrected_reply: '', intent: '' }
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENDPOINT
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GuardrailRequest

    if (!body.user_message) {
      return NextResponse.json({
        error: "Missing 'user_message' in request body.",
      }, { status: 400 })
    }

    const {
      user_message,
      draft_reply = '',
      chat_history = [],
      lead_data = {},
      bot_rules,
    } = body

    const businessName = bot_rules?.business_name || 'Bisnis Kami'
    const intent = detectIntent(user_message)
    const entities = extractEntitiesFromMessage(user_message)

    // ═══ LAYER 1: Rule-based checks (fast, free) ═══

    // ── Check 1: Cancel intent ──
    if (intent === 'cancel') {
      return NextResponse.json({
        valid: false,
        reason: 'User wants to cancel / stop the conversation.',
        corrected_reply: buildCorrectedReply('cancel', entities, lead_data, businessName),
        intent,
        confidence: 0.95,
      } satisfies GuardrailResponse)
    }

    // ── Check 2: Admin handoff ──
    if (intent === 'admin_handoff') {
      return NextResponse.json({
        valid: false,
        reason: 'User requested to speak with a human admin.',
        corrected_reply: '', // empty = handover
        intent,
        confidence: 0.95,
      } satisfies GuardrailResponse)
    }

    // ── Check 3: Off-topic questions ──
    if (['ask_price', 'ask_location', 'ask_portfolio', 'ask_hours', 'ask_contact', 'ask_promo', 'ask_payment'].includes(intent)) {
      return NextResponse.json({
        valid: false,
        reason: `User asked about ${intent.replace('ask_', '')} — draft reply doesn't address this.`,
        corrected_reply: buildCorrectedReply(intent, entities, lead_data, businessName, bot_rules),
        intent,
        confidence: 0.85,
      } satisfies GuardrailResponse)
    }

    // ── Check 4: Name extraction false positive ──
    const extractedName = lead_data?.name || lead_data?.contact_name || ''
    if (extractedName && isNameFalsePositive(extractedName)) {
      // Draft uses a false-positive name — fix it
      const correctedDraft = draft_reply
        .replace(new RegExp(`Kak\\s+${extractedName}`, 'gi'), 'Kak')
        .replace(new RegExp(`\\b${extractedName}\\b`, 'gi'), '')
        .replace(/\s{2,}/g, ' ')
        .trim()

      return NextResponse.json({
        valid: false,
        reason: `Name "${extractedName}" is a false positive (common word, not a real name).`,
        corrected_reply: correctedDraft || `Halo Kak! 👋 Ada yang bisa ${businessName} bantu? 😊`,
        extracted_entities: entities,
        intent,
        confidence: 0.95,
      } satisfies GuardrailResponse)
    }

    // ── Check 5: Draft repeating itself ──
    if (draft_reply && isDraftRepeatingHistory(draft_reply, chat_history)) {
      // If we have new entities from user message, build a smarter reply
      if (Object.keys(entities).length > 0) {
        const parts: string[] = [`Terima kasih infonya Kak! 😊`]
        if (entities.event_type) parts.push(`Jenis acara: *${entities.event_type}*`)
        if (entities.venue_type) parts.push(`Lokasi: *${entities.venue_type}*`)
        if (entities.event_date) parts.push(`Tanggal: *${entities.event_date}*`)
        if (entities.location) parts.push(`Kota: *${entities.location}*`)

        // Check what's still missing
        const requiredFields = bot_rules?.fields?.filter(f => f.required) || []
        const knownKeys = new Set([...Object.keys(lead_data), ...Object.keys(entities)])
        const missing = requiredFields.filter(f => !knownKeys.has(f.key) && f.key !== 'name' && f.key !== 'contact_name')

        if (missing.length > 0) {
          parts.push(`\nMohon bantu lengkapi:`)
          for (const f of missing) {
            parts.push(`${f.label}:`)
          }
        } else {
          parts.push(`\nData sudah lengkap! Tim admin kami akan segera menghubungi Kakak 😊`)
        }

        return NextResponse.json({
          valid: false,
          reason: 'Draft reply is repeating previous bot message. User already provided data.',
          corrected_reply: parts.join('\n'),
          extracted_entities: entities,
          intent: 'providing_data',
          confidence: 0.90,
        } satisfies GuardrailResponse)
      }

      // No new entities — just acknowledge briefly instead of repeating
      return NextResponse.json({
        valid: false,
        reason: 'Draft reply is repeating previous bot message. Sending brief acknowledgment instead.',
        corrected_reply: `Siap Kak! 😊 Kalau ada info yang mau ditambahkan, silakan ya.`,
        intent: 'acknowledgment',
        confidence: 0.80,
      } satisfies GuardrailResponse)
    }

    // ── Check 6: Entities extracted but draft doesn't acknowledge them ──
    if (Object.keys(entities).length > 0 && draft_reply) {
      const draftLower = draft_reply.toLowerCase()
      const unacknowledged: string[] = []

      if (entities.event_type && !draftLower.includes(entities.event_type.toLowerCase())) {
        unacknowledged.push(`event_type=${entities.event_type}`)
      }
      if (entities.venue_type && !draftLower.includes(entities.venue_type.toLowerCase())) {
        unacknowledged.push(`venue_type=${entities.venue_type}`)
      }

      if (unacknowledged.length > 0) {
        // Build a reply that acknowledges extracted data
        const parts: string[] = []
        const name = lead_data?.name || lead_data?.contact_name || ''
        const greeting = name ? `Kak ${name}` : 'Kak'

        if (entities.event_type && entities.venue_type) {
          parts.push(`Oke ${greeting}, ${entities.event_type} di ${entities.venue_type} ya! 🎉`)
        } else if (entities.event_type) {
          parts.push(`Oke ${greeting}, ${entities.event_type} ya! 🎉`)
        } else if (entities.venue_type) {
          parts.push(`Oke ${greeting}, lokasi di ${entities.venue_type} ya! 🏛️`)
        }

        // Ask for remaining missing info
        const requiredFields = bot_rules?.fields?.filter(f => f.required) || []
        const knownKeys = new Set([...Object.keys(lead_data), ...Object.keys(entities)])
        const missing = requiredFields.filter(f => !knownKeys.has(f.key) && f.key !== 'name' && f.key !== 'contact_name')

        if (missing.length > 0) {
          const missingLabels = missing.map(f => f.label).join(', ')
          parts.push(`Boleh info ${missingLabels}? 😊`)
        } else {
          parts.push(`\nData sudah lengkap! Tim admin kami akan segera menghubungi Kakak. Mohon ditunggu ya! 😊`)
        }

        return NextResponse.json({
          valid: false,
          reason: `Draft doesn't acknowledge extracted entities: ${unacknowledged.join(', ')}`,
          corrected_reply: parts.join('\n'),
          extracted_entities: entities,
          intent: 'providing_data',
          confidence: 0.90,
        } satisfies GuardrailResponse)
      }
    }

    // ═══ LAYER 2: LLM Context Check (for ambiguous cases) ═══

    // Only call LLM if:
    // 1. MiMo API key is configured
    // 2. Draft reply exists (nothing to validate if no draft)
    // 3. It's not a simple greeting (greetings are always fine)
    // 4. intent is unknown or providing_data (these are the ambiguous ones)

    const shouldCallLlm =
      MIMO_API_KEY &&
      draft_reply &&
      intent !== 'greeting'

    if (shouldCallLlm) {
      const llmResult = await llmContextCheck(
        user_message,
        draft_reply,
        chat_history,
        lead_data,
        bot_rules,
      )

      if (!llmResult.valid) {
        console.log(`[guardrail] LLM flagged: ${llmResult.reason}`)
        return NextResponse.json({
          valid: false,
          reason: `[LLM] ${llmResult.reason}`,
          corrected_reply: llmResult.corrected_reply || undefined,
          extracted_entities: Object.keys(entities).length > 0 ? entities : undefined,
          intent: llmResult.intent || intent,
          confidence: 0.85,
        } satisfies GuardrailResponse)
      }
    }

    // ── All checks passed — draft is valid ──
    return NextResponse.json({
      valid: true,
      reason: shouldCallLlm ? 'Draft passed all rule + LLM checks.' : 'Draft passed all rule checks (LLM not configured or skipped).',
      intent,
      extracted_entities: Object.keys(entities).length > 0 ? entities : undefined,
      confidence: 0.95,
    } satisfies GuardrailResponse)

  } catch (error) {
    console.error('[guardrail] Error:', error)
    return NextResponse.json({
      error: 'Guardrail internal error.',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}

// GET health check
export async function GET() {
  return NextResponse.json({
    status: 'guardrail alive',
    version: '2.0.0',
    mode: MIMO_API_KEY ? 'hybrid (rule + llm)' : 'rule-only',
    checks: [
      'cancel_intent',
      'admin_handoff',
      'off_topic_questions',
      'name_false_positive',
      'repeat_detection',
      'entity_acknowledgment',
      ...(MIMO_API_KEY ? ['llm_context_check'] : []),
    ],
  })
}
