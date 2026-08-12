/**
 * industry-templates.ts — All available industry templates
 * This is a UI-friendly list (label, description, icon).
 * Full field configs are in chat-engine.ts INDUSTRY_TEMPLATES.
 */

export interface BotField {
  key: string
  label: string
  emoji: string
  type: 'text' | 'date' | 'select' | 'keyword' | 'location'
  required: boolean
  options?: string[]
  keywords?: Record<string, string[]>
  placeholder?: string
  default_value?: string
}

export interface IndustryPreset {
  key: string
  name: string
  icon: string
  description: string
  fields: BotField[]
  default_greeting: string
  default_followup: string
  default_pricelist_links: Record<string, string>
  color: string         // bg color class hint
}

export const INDUSTRY_TEMPLATES: Record<string, IndustryPreset> = {
  wedding_decor: {
    key: 'wedding_decor',
    name: 'Wedding & Decoration',
    icon: '💒',
    color: 'bg-pink-900/30',
    description: 'Dekorasi pernikahan, lamaran, ulang tahun, engagement',
    fields: [
      { key: 'name', label: 'Nama', emoji: '👤', type: 'text', required: true, placeholder: 'Nama lengkap' },
      { key: 'event_date', label: 'Tanggal Acara', emoji: '📅', type: 'date', required: false, placeholder: 'contoh: 20 Oktober 2026', default_value: 'Belum pasti' },
      { key: 'event_type', label: 'Jenis Acara', emoji: '💒', type: 'keyword', required: true,
        keywords: {
          'Wedding': ['nikah', 'wedding', 'resepsi', 'akad', 'menikah', 'pernikahan', 'unduh mantu'],
          'Engagement': ['lamaran', 'engagement', 'tunangan', 'melamar', 'siraman'],
        },
      },
      { key: 'venue_type', label: 'Lokasi Acara', emoji: '🏛️', type: 'keyword', required: true,
        keywords: {
          'Gedung': ['gedung', 'hotel', 'hall', 'ballroom', 'masjid', 'resto', 'restaurant', 'convention', 'aula', 'villa'],
          'Rumah': ['rumah', 'halaman', 'garasi', 'home', 'kediaman', 'outdoor', 'taman', 'pool', 'rooftop'],
        },
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
    default_pricelist_links: {},
  },

  jasa_rental: {
    key: 'jasa_rental',
    name: 'Jasa Rental',
    icon: '🚗',
    color: 'bg-blue-900/30',
    description: 'Sewa mobil, kamera, alat, perlengkapan acara',
    fields: [
      { key: 'name', label: 'Nama', emoji: '👤', type: 'text', required: true },
      { key: 'item_type', label: 'Jenis Barang', emoji: '🚗', type: 'keyword', required: true,
        keywords: {
          'Mobil': ['mobil', 'car', 'toyota', 'honda', 'avanza', 'innova', 'fortuner'],
          'Kamera': ['kamera', 'camera', 'dslr', 'mirrorless', 'gopro', 'drone'],
          'Alat Berat': ['alat berat', 'excavator', 'buldoser', 'crane'],
        },
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
    icon: '💊',
    color: 'bg-green-900/30',
    description: 'Booking jadwal periksa, treatment kecantikan, dokter',
    fields: [
      { key: 'name', label: 'Nama', emoji: '👤', type: 'text', required: true },
      { key: 'service', label: 'Jenis Layanan', emoji: '💊', type: 'keyword', required: true,
        keywords: {
          'Umum': ['umum', 'periksa', 'dokter umum', 'capek', 'demam'],
          'Gigi': ['gigi', 'tambal', 'cabut gigi', 'scaling'],
          'Kecantikan': ['kecantikan', 'facial', 'botox', 'laser', 'acne', 'filler'],
        },
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
    icon: '🛍️',
    color: 'bg-orange-900/30',
    description: 'Order barang, tanya stok, tanya harga, delivery',
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
    name: 'Bisnis Umum',
    icon: '🏢',
    color: 'bg-zinc-800',
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

export const PRESET_KEYS = Object.keys(INDUSTRY_TEMPLATES)
