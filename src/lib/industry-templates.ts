/**
 * industry-templates.ts — All available industry templates
 * Single Source of Truth for industry presets, field configurations, and auto-reply templates.
 */

import type { BotField } from '@/lib/db'

export type { BotField }

export interface IndustryPreset {
  key: string
  name: string
  icon: string
  description: string
  fields: BotField[]
  default_greeting: string
  default_followup: string
  default_completion: string
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
      "Senang sekali bisa menyambut Kakak! Biar kami bisa memberikan rekomendasi katalog & pricelist dekorasi yang paling pas, boleh dibantu infokan detail rencananya:\n\n" +
      "{{field_forms}}\n\n" +
      "💡 *Catatan: Jika tanggal acaranya belum pasti, tidak apa-apa dikosongi atau dilewati dulu ya Kak!*\n\n" +
      "Ditunggu informasinya ya Kak! 😊",
    default_followup:
      "Terima kasih infonya Kak! 😊\n\n" +
      "Supaya tim dekorasi kami bisa siapkan estimasi penawaran yang akurat, boleh bantu lengkapi data berikut ya:\n" +
      "{{missing_fields}}\n\n" +
      "💡 *Untuk tanggal acara, boleh dikosongi dulu jika belum pasti ya Kak!*",
    default_completion:
      "Terima kasih banyak Kak {{name}}! 🙏✨\n\n" +
      "Data rencana acara Kakak sudah tersimpan lengkap:\n" +
      "{{field_summary}}\n\n" +
      "💬 Tim Admin CS dekorasi {{business_name}} akan segera menghubungkan dan melanjutkan percakapan ini secara langsung untuk konsultasi & penyesuaian anggaran dekorasi Kakak.\n\n" +
      "Mohon tunggu sebentar ya Kak! 😊",
    default_pricelist_links: {
      'Pricelist Wedding Gedung [wedding, gedung]': 'https://catalog.weddingdecor.com/gedung',
      'Pricelist Wedding Rumah [wedding, rumah]': 'https://catalog.weddingdecor.com/rumah',
      'Pricelist Lamaran Gedung [engagement, lamaran, gedung]': 'https://catalog.weddingdecor.com/engagement-gedung',
      'Pricelist Lamaran Rumah [engagement, lamaran, rumah]': 'https://catalog.weddingdecor.com/engagement-rumah',
    },
  },

  jasa_rental: {
    key: 'jasa_rental',
    name: 'Jasa Rental (Mobil/Motor/Alat)',
    icon: '🚗',
    color: 'bg-blue-900/30',
    description: 'Sewa mobil, kendaraan, kamera, alat, perlengkapan acara',
    fields: [
      { key: 'name', label: 'Nama Lengkap', emoji: '👤', type: 'text', required: true, placeholder: 'Nama pemesan' },
      { key: 'item_type', label: 'Jenis Barang / Kendaraan', emoji: '🚗', type: 'keyword', required: true,
        keywords: {
          'Mobil MPV / Family': ['mobil', 'avanza', 'innova', 'xl7', 'ertiga', 'xenia', 'calya', 'sigra'],
          'Mobil SUV / Premium': ['fortuner', 'pajero', 'alphard', 'zenix', 'crv', 'hrv'],
          'Kamera & Alat Foto': ['kamera', 'camera', 'dslr', 'mirrorless', 'gopro', 'drone', 'lensa'],
          'Alat Acara / Sound': ['sound', 'genset', 'tenda', 'panggung', 'lighting'],
        },
      },
      { key: 'rental_date', label: 'Tanggal & Durasi Sewa', emoji: '📅', type: 'date', required: true, placeholder: 'Contoh: 15-17 Agustus (3 hari)' },
      { key: 'location', label: 'Kota / Lokasi Pengantaran', emoji: '📍', type: 'location', required: false, placeholder: 'Kota / alamat delivery' },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di {{business_name}} Rent Services. 🚗✨\n\n" +
      "Terima kasih sudah menghubungi kami! Supaya CS kami bisa cek ketersediaan (unit ready) dan hitungkan estimasi biaya sewa, mohon lengkapi info berikut ya:\n\n" +
      "{{field_forms}}\n\n" +
      "⚡ CS kami akan segera mengkonfirmasi ketersediaan unit untuk Kakak!",
    default_followup:
      "Terima kasih Kak! 🙏\n\n" +
      "Supaya kami bisa langsung amankan jadwal dan tahan unit sewa Kakak, mohon bantu lengkapi data berikut:\n\n" +
      "{{missing_fields}}\n\n" +
      "Ketik balasan Kakak di sini ya! 🚗",
    default_completion:
      "Terima kasih banyak Kak {{name}}! 🙏✨\n\n" +
      "Data pemesanan sewa Kakak sudah kami terima:\n" +
      "{{field_summary}}\n\n" +
      "🚗 Admin CS {{business_name}} sedang mengecek jadwal ketersediaan unit & akan segera melanjutkan percakapan ini secara langsung untuk proses booking unit Kakak.\n\n" +
      "Mohon ditunggu ya Kak! ⚡",
    default_pricelist_links: {
      'Katalog & Tarif Rental Mobil [mobil]': 'https://catalog.rentalservice.com/cars',
    },
  },

  klinik: {
    key: 'klinik',
    name: 'Klinik / Dokter / Kecantikan',
    icon: '💊',
    color: 'bg-green-900/30',
    description: 'Booking jadwal periksa, treatment kecantikan, reservasi dokter',
    fields: [
      { key: 'name', label: 'Nama Pasien', emoji: '👤', type: 'text', required: true, placeholder: 'Nama pasien' },
      { key: 'service', label: 'Layanan / Treatment', emoji: '💊', type: 'keyword', required: true,
        keywords: {
          'Konsultasi Dokter': ['umum', 'periksa', 'dokter umum', 'demam', 'konsultasi', 'spesialis'],
          'Perawatan Gigi': ['gigi', 'tambal', 'cabut gigi', 'scaling', 'behel', 'veneer'],
          'Kecantikan / Skincare': ['kecantikan', 'facial', 'botox', 'laser', 'acne', 'filler', 'peeling', 'glowing'],
        },
      },
      { key: 'visit_date', label: 'Rencana Tanggal Periksa', emoji: '📅', type: 'date', required: true, placeholder: 'Tanggal & jam kedatangan' },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di {{business_name}} Care & Beauty Clinic. 💊✨\n\n" +
      "Terima kasih telah menghubungi Customer Service kami. Untuk reservasi jadwal dokter atau booking treatment perawatan, mohon bantu isi data berikut ya:\n\n" +
      "{{field_forms}}\n\n" +
      "🏥 Staf medis kami siap menyambut dan melayani kehadiran Kakak!",
    default_followup:
      "Terima kasih infonya Kak! 🙏\n\n" +
      "Agar jadwal slot antrean reservasi periksa Kakak bisa langsung dikonfirmasi oleh perawat kami, mohon bantu lengkapi:\n\n" +
      "{{missing_fields}}\n\n" +
      "Ditunggu jawabannya ya Kak! 🏥",
    default_completion:
      "Terima kasih banyak Kak {{name}}! 🙏✨\n\n" +
      "Data reservasi periksa Kakak telah tersimpan:\n" +
      "{{field_summary}}\n\n" +
      "🏥 Petugas pendaftaran / perawat {{business_name}} akan segera melanjutkan percakapan ini untuk mengkonfirmasi slot antrean jam kedatangan Kakak.\n\n" +
      "Mohon ditunggu sebentar ya Kak! 😊",
    default_pricelist_links: {
      'Daftar Harga Treatment & Paket Klinik [treatment]': 'https://catalog.clinic.com/treatments',
    },
  },

  toko_online: {
    key: 'toko_online',
    name: 'Toko Online / UMKM / Fashion',
    icon: '🛍️',
    color: 'bg-orange-900/30',
    description: 'Order barang, tanya stok, katalog produk, pengiriman',
    fields: [
      { key: 'name', label: 'Nama Pemesan', emoji: '👤', type: 'text', required: true, placeholder: 'Nama lengkap' },
      { key: 'item_wanted', label: 'Produk / Ukuran yang Dicari', emoji: '🛍️', type: 'text', required: true, placeholder: 'Contoh: Kemeja Linen Navy Size L' },
      { key: 'location', label: 'Kota / Kecamatan Pengiriman', emoji: '📍', type: 'location', required: false, placeholder: 'Kota tujuan kirim' },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di Store Resmi {{business_name}}. 🛍️✨\n\n" +
      "Terima kasih sudah mampir! Kami siap membantu cek ketersediaan stok, promo hari ini, maupun estimasi ongkir. Mohon infokan detail pesanan Kakak ya:\n\n" +
      "{{field_forms}}\n\n" +
      "📦 *Pesanan siap dikirim ke seluruh wilayah Indonesia!*",
    default_followup:
      "Terima kasih infonya Kak! 😊\n\n" +
      "Agar admin toko kami bisa langsung hitungkan total belanja + diskon ongkir pengiriman, mohon bantu lengkapi:\n\n" +
      "{{missing_fields}}\n\n" +
      "Terima kasih Kak! 📦",
    default_completion:
      "Terima kasih banyak Kak {{name}}! 🙏✨\n\n" +
      "Detail pesanan & lokasi pengiriman Kakak sudah tersimpan:\n" +
      "{{field_summary}}\n\n" +
      "📦 Admin toko {{business_name}} akan segera melanjutkan percakapan ini secara langsung untuk memberikan total rincian belanja + nomor rekening / QRIS pembayaran.\n\n" +
      "Mohon tunggu sebentar ya Kak! 😊",
    default_pricelist_links: {
      'Katalog Produk Terbaru & Ready Stock [produk]': 'https://catalog.onlinestore.com/ready',
    },
  },

  generic: {
    key: 'generic',
    name: 'Bisnis Umum / Jasa Lainnya',
    icon: '🏢',
    color: 'bg-zinc-800',
    description: 'Template fleksibel untuk semua jenis usaha & konsultasi',
    fields: [
      { key: 'name', label: 'Nama Lengkap', emoji: '👤', type: 'text', required: true, placeholder: 'Nama Kakak' },
      { key: 'inquiry', label: 'Pertanyaan / Kebutuhan', emoji: '💬', type: 'text', required: true, placeholder: 'Deskripsi singkat kebutuhan Anda' },
      { key: 'date', label: 'Rencana Pelaksanaan', emoji: '📅', type: 'date', required: false, default_value: 'Belum pasti', placeholder: 'Tanggal (bisa dikosongi)' },
      { key: 'location', label: 'Lokasi / Kota', emoji: '📍', type: 'location', required: false, placeholder: 'Kota asal Anda' },
    ],
    default_greeting:
      "Halo Kak! 👋 Selamat datang di Customer Care {{business_name}}. 🏢✨\n\n" +
      "Terima kasih telah menghubungi kami. Agar tim kami dapat memberikan pelayanan terbaik dan jawaban yang akurat, mohon bantu isi informasi singkat berikut ya:\n\n" +
      "{{field_forms}}\n\n" +
      "💬 Tim kami akan segera merespon balasan Kakak!",
    default_followup:
      "Terima kasih infonya Kak! 😊\n\n" +
      "Bantu kami lengkapi sedikit informasi lagi ya Kak agar bisa segera kami proses:\n\n" +
      "{{missing_fields}}\n\n" +
      "Terima kasih banyak atas kerjasamanya! 🙏",
    default_completion:
      "Terima kasih banyak Kak {{name}}! 🙏✨\n\n" +
      "Informasi kebutuhan Kakak sudah tersimpan lengkap:\n" +
      "{{field_summary}}\n\n" +
      "💬 Tim Admin Customer Service {{business_name}} akan segera menghubungkan dan melanjutkan percakapan ini secara langsung dengan Kakak.\n\n" +
      "Mohon ditunggu ya Kak! 😊",
    default_pricelist_links: {},
  },
}

export const PRESET_KEYS = Object.keys(INDUSTRY_TEMPLATES)
