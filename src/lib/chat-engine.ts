/**
 * chat-engine.ts — Generic chat engine driven by BotConfig
 *
 * 4-step funnel:
 *   1. Greeting → ask for fields defined in bot_config.fields
 *   2. Extract field values from conversation (lead-parser.ts)
 *   3. If complete → send pricelist link + handover to admin
 *   4. If incomplete → ask for missing fields only
 *
 * Works for ANY industry — the BotField[] config defines what to collect.
 */

import { accumulateLeadData, isGreeting, type LeadData } from './lead-parser'
import type { BotField, BotConfig, Lead as DbLead } from './db'

// ─── Industry templates (presets) ───

export interface IndustryTemplate {
  key: string
  name: string
  description: string
  fields: BotField[]
  default_greeting: string
  default_followup: string
  default_pricelist_links: Record<string, string>
}

export const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
  wedding_decor: {
    key: 'wedding_decor',
    name: 'Wedding & Decoration',
    description: 'Dekorasi pernikahan, lamaran, ulang tahun',
    fields: [
      { key: 'name', label: 'Nama', emoji: '👤', type: 'text', required: true, placeholder: 'Nama lengkap' },
      { key: 'event_date', label: 'Tanggal Acara', emoji: '📅', type: 'date', required: false, placeholder: 'contoh: 20 Oktober 2026', default_value: 'Belum pasti' },
      { key: 'event_type', label: 'Jenis Acara', emoji: '💒', type: 'keyword', required: true,
        keywords: { 'Wedding': ['nikah', 'wedding', 'resepsi', 'akad', 'menikah', 'pernikahan', 'unduh mantu'],
                    'Engagement': ['lamaran', 'engagement', 'tunangan', 'melamar', 'siraman'] },
      },
      { key: 'venue_type', label: 'Lokasi Acara', emoji: '🏛️', type: 'keyword', required: true,
        keywords: { 'Gedung': ['gedung', 'hotel', 'hall', 'ballroom', 'masjid', 'resto', 'restaurant', 'convention', 'aula', 'villa'],
                    'Rumah': ['rumah', 'halaman', 'garasi', 'home', 'kediaman', 'outdoor', 'taman', 'pool', 'rooftop'] },
      },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di {{business_name}}. ✨\n\n" +
      "Senang sekali bisa menyambut Kakak! Biar kami bisa memberikan rekomendasi katalog & pricelist yang paling pas, boleh dibantu infokan detail rencananya:\n\n" +
      "{{field_forms}}\n\n" +
      "💡 *Catatan: Jika tanggal acaranya belum ada, tidak apa-apa dikosongi atau dilewati dulu ya Kak!*\n\n" +
      "Ditunggu informasinya ya Kak! 😊",
    default_followup:
      "Terima kasih infonya Kak! 😊\n\n" +
      "Boleh dilengkapi lagi ya Kak untuk data berikut:\n" +
      "{{missing_fields}}\n\n" +
      "💡 *Untuk tanggal acara, boleh dikosongi dulu jika belum pasti ya Kak!*",
    default_pricelist_links: {
      'Wedding Gedung': 'https://drive.google.com/file/d/1TKXd4R10wQFI_BL9_Z4nD8iXiXsD9k7X/view',
      'Wedding Rumah': 'https://drive.google.com/file/d/1TKXd4R10wQFI_BL9_Z4nD8iXiXsD9k7X/view',
      'Engagement Gedung': 'https://drive.google.com/file/d/1TKXd4R10wQFI_BL9_Z4nD8iXiXsD9k7X/view',
      'Engagement Rumah': 'https://drive.google.com/file/d/1TKXd4R10wQFI_BL9_Z4nD8iXiXsD9k7X/view',
    },
  },

  jasa_rental: {
    key: 'jasa_rental',
    name: 'Jasa Rental (Mobil, Kamera, dll)',
    description: 'Sewa mobil, kamera, perlengkapan acara, alat berat',
    fields: [
      { key: 'name', label: 'Nama', emoji: '👤', type: 'text', required: true },
      { key: 'item_type', label: 'Jenis Barang', emoji: '🚗', type: 'keyword', required: true,
        keywords: { 'Mobil': ['mobil', 'car', 'toyota', 'honda', 'avanza', 'innova', 'fortuner'],
                    'Kamera': ['kamera', 'camera', 'dslr', 'mirrorless', 'gopro', 'drone'],
                    'Alat Berat': ['alat berat', 'excavator', 'buldoser', 'crane'] },
      },
      { key: 'rental_date', label: 'Tanggal Sewa', emoji: '📅', type: 'date', required: true },
      { key: 'location', label: 'Lokasi', emoji: '📍', type: 'location', required: false },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di {{business_name}}. ✨\n\n" +
      "Butuh jasa sewa apa nih Kak? Bantu kami isi data ini ya:\n\n" +
      "{{field_forms}}\n\n" +
      "Ditunggu informasinya ya Kak! 😊",
    default_followup:
      "Terima kasih infonya Kak! 😊\nBoleh dilengkapi lagi ya Kak untuk:\n{{missing_fields}}",
    default_pricelist_links: {},
  },

  klinik: {
    key: 'klinik',
    name: 'Klinik / Dokter / Kecantikan',
    description: 'Booking jadwal periksa, treatment kecantikan',
    fields: [
      { key: 'name', label: 'Nama', emoji: '👤', type: 'text', required: true },
      { key: 'service', label: 'Jenis Layanan', emoji: '💊', type: 'keyword', required: true,
        keywords: { 'Umum': ['umum', 'periksa', 'dokter umum', 'capek', 'demam'],
                    'Gigi': ['gigi', 'tambal', 'cabut gigi', 'scaling'],
                    'Kecantikan': ['kecantikan', 'facial', 'botox', 'laser', 'acne'] },
      },
      { key: 'visit_date', label: 'Jadwal Periksa', emoji: '📅', type: 'date', required: true },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di {{business_name}}.\n\n" +
      "Mau jadwal periksa atau treatment apa nih? Bantu isi data ini:\n\n" +
      "{{field_forms}}\n\nDitunggu! 😊",
    default_followup:
      "Terima kasih Kak! 😊\nBoleh lengkapi lagi ya:\n{{missing_fields}}",
    default_pricelist_links: {},
  },

  toko_online: {
    key: 'toko_online',
    name: 'Toko Online / UMKM',
    description: 'Order barang, tanya stok, tanya harga',
    fields: [
      { key: 'name', label: 'Nama', emoji: '👤', type: 'text', required: true },
      { key: 'item_wanted', label: 'Barang yang Dicari', emoji: '🛍️', type: 'text', required: true, placeholder: 'Nama barang / produk' },
      { key: 'location', label: 'Kota Pengiriman', emoji: '📍', type: 'location', required: false },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di {{business_name}}. ✨\n\n" +
      "Mau tanya produk apa nih Kak? Bantu isi data ini ya:\n\n" +
      "{{field_forms}}\n\nDitunggu! 😊",
    default_followup:
      "Terima kasih Kak! 😊\nBoleh lengkapi lagi ya:\n{{missing_fields}}",
    default_pricelist_links: {},
  },

  generic: {
    key: 'generic',
    name: 'Bisnis Umum (Custom)',
    description: 'Template kosong, user isi sendiri semua field',
    fields: [
      { key: 'name', label: 'Nama', emoji: '👤', type: 'text', required: true },
      { key: 'inquiry', label: 'Pertanyaan / Kebutuhan', emoji: '💬', type: 'text', required: true },
      { key: 'date', label: 'Tanggal', emoji: '📅', type: 'date', required: false, default_value: 'Belum pasti' },
      { key: 'location', label: 'Lokasi', emoji: '📍', type: 'location', required: false },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di {{business_name}}.\n\n" +
      "Ada yang bisa kami bantu? Bantu isi data ini ya:\n\n" +
      "{{field_forms}}\n\nDitunggu! 😊",
    default_followup:
      "Terima kasih Kak! 😊\nBoleh lengkapi lagi ya:\n{{missing_fields}}",
    default_pricelist_links: {},
  },
}

// ─── Helpers ───

export function buildFieldForms(fields: BotField[]): string {
  return fields
    .map(f => `${f.emoji} **${f.label}** ${f.required ? '' : '(opsional)'}:`)
    .join('\n')
}

export function buildMissingFields(fields: BotField[], missingKeys: string[]): string {
  return fields
    .filter(f => missingKeys.includes(f.key))
    .map(f => `- ${f.emoji} **${f.label}**`)
    .join('\n')
}

export function buildPricelistResponse(
  fieldValues: Record<string, string>,
  fields: BotField[],
  pricelistLinks: Record<string, string>,
  businessName: string,
): string {
  const name = fieldValues['name'] || fieldValues['contact_name'] || 'Kak'
  const pkg = fieldValues['_package']
  const link = pkg && pricelistLinks[pkg] ? pricelistLinks[pkg] : Object.values(pricelistLinks)[0]

  const fieldSummary = fields
    .filter(f => fieldValues[f.key])
    .map(f => `${f.emoji} **${f.label}**: ${fieldValues[f.key]}`)
    .join('\n')

  let msg = `Terima kasih banyak, Kak ${name}! ✨\n\nData sudah kami catat:\n${fieldSummary}\n\n`
  if (link) msg += `📄 Berikut link pricelist resmi:\n${link}\n\n`
  msg += `Percakapan ini akan segera dilanjutkan langsung oleh Admin kami untuk konsultasi & penyesuaian lebih lanjut! 😊`
  return msg
}

// ─── Main handler ───

export interface ChatEngineResult {
  reply: string
  leadSaved: boolean
  leadData: LeadData
  autoReply: boolean
  handoverToAdmin: boolean
}

/**
 * Main handler — generic, driven by BotConfig.
 */
export function handleChat(
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  existingLead: DbLead | undefined | null,
  botConfig: {
    fields: BotField[]
    templates: Record<string, string>
    pricelist_links: Record<string, string>
    business_name: string
  },
): ChatEngineResult {
  const { fields, templates, pricelist_links, business_name } = botConfig
  const nameKey = fields.find(f => f.key === 'name' || f.key === 'contact_name')?.key || 'name'

  // ── Pre-extract existing DB data (before any narrowing) ──
  const existingData: Record<string, string> = existingLead
    ? (() => { try { return JSON.parse(existingLead.data_json || '{}') as Record<string, string> } catch { return {} } })()
    : {}

  // ── 1. Empty message ──
  if (!userMessage || !userMessage.trim()) {
    return {
      reply: `Halo! Ada yang bisa ${business_name} bantu? 😊`,
      leadSaved: false,
      leadData: { field_values: existingData, is_complete: false, missing_fields: fields.filter(f => f.required && !existingData[f.key]).map(f => f.key) },
      autoReply: true,
      handoverToAdmin: false,
    }
  }

  // ── 2. Existing lead → silent handover ──
  if (existingLead && existingLead.status !== 'Inquiry') {
    return {
      reply: '',
      leadSaved: false,
      leadData: { field_values: existingData, is_complete: true, missing_fields: [] },
      autoReply: false,
      handoverToAdmin: true,
    }
  }

  // ── 3. Greeting only → send full form ──
  if (isGreeting(userMessage, fields) && history.length <= 1 && Object.keys(existingData).length === 0) {
    const fieldForms = buildFieldForms(fields)
    const greeting = (templates.greeting || '')
      .replace(/\{\{business_name\}\}/g, business_name)
      .replace(/\{\{field_forms\}\}/g, fieldForms)
    return {
      reply: greeting,
      leadSaved: false,
      leadData: { field_values: {}, is_complete: false, missing_fields: fields.map(f => f.key) },
      autoReply: true,
      handoverToAdmin: false,
    }
  }

  // ── 4. Extract and accumulate data ──
  const leadInfo = accumulateLeadData(history, userMessage, fields, existingData)

  // ── 5. Complete → pricelist + handover ──
  if (leadInfo.is_complete) {
    const reply = buildPricelistResponse(leadInfo.field_values, fields, pricelist_links, business_name)
    return {
      reply,
      leadSaved: true,
      leadData: leadInfo,
      autoReply: true,
      handoverToAdmin: true,
    }
  }

  // ── 6. Incomplete → ask for missing fields ──
  const fieldForms = buildFieldForms(fields)
  const missingText = buildMissingFields(fields, leadInfo.missing_fields)
  const followup = (templates.followup || templates.greeting || '')
    .replace(/\{\{business_name\}\}/g, business_name)
    .replace(/\{\{missing_fields\}\}/g, missingText)
    .replace(/\{\{field_forms\}\}/g, fieldForms)

  return {
    reply: followup || `Terima kasih infonya Kak! 😊\nBoleh dilengkapi lagi ya:\n${missingText}`,
    leadSaved: false,
    leadData: leadInfo,
    autoReply: true,
    handoverToAdmin: false,
  }
}
