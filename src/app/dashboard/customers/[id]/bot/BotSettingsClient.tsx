'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { INDUSTRY_TEMPLATES, type BotField } from '@/lib/industry-templates'
import { handleChat, findMatchingPricelistLink } from '@/lib/chat-engine'
import { useToast } from '@/components/Toast'
import { createClient } from '@/lib/supabase/client'

interface BotConfigData {
  industry_preset: string
  enabled: boolean
  fields: BotField[]
  templates: { greeting: string; followup: string; completion?: string }
  pricelist_links: Record<string, string>
}

const TEMPLATES = INDUSTRY_TEMPLATES

export default function BotSettingsClient({ customerId, hideBackButton }: { customerId: string; hideBackButton?: boolean }) {
  const id = customerId
  const [cfg, setCfg] = useState<BotConfigData | null>(null)
  const [customerName, setCustomerName] = useState('Flowku')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editingFields, setEditingFields] = useState<BotField[]>([])

  // Modal State for Adding/Editing Field
  const [showFieldModal, setShowFieldModal] = useState(false)
  const [editFieldIndex, setEditFieldIndex] = useState<number | null>(null)
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldEmoji, setFieldEmoji] = useState('📝')
  const [fieldType, setFieldType] = useState<'text' | 'date' | 'select' | 'keyword' | 'location'>('text')
  const [fieldRequired, setFieldRequired] = useState(true)
  const [fieldPlaceholder, setFieldPlaceholder] = useState('')

  const [greeting, setGreeting] = useState('')
  const [followup, setFollowup] = useState('')
  const [completion, setCompletion] = useState('')
  const [pricelistLinks, setPricelistLinks] = useState<Record<string, string>>({})
  const [preset, setPreset] = useState('generic')
  const [enabled, setEnabled] = useState(true)
  const [testModeEnabled, setTestModeEnabled] = useState(false)
  const [testPhoneNumbers, setTestPhoneNumbers] = useState('')

  // Custom Bot Logic (Webhook Forwarder) State
  const [botMode, setBotMode] = useState<'template' | 'custom'>('template')
  const [customWebhookUrl, setCustomWebhookUrl] = useState('')
  const [customWebhookSecret, setCustomWebhookSecret] = useState('')
  const [customWebhookTimeoutMs, setCustomWebhookTimeoutMs] = useState(15000)
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; reply?: string; error?: string } | null>(null)
  const [showDevSettings, setShowDevSettings] = useState(false)

  // Auth User Email & Superadmin Role Check
  const [userEmail, setUserEmail] = useState<string | null>(null)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email)
      }
    })
  }, [])

  const isAdmin = userEmail === 'coderey.wiki@gmail.com'

  // Dynamic Pricelist Link Rule State
  const [newLinkKey, setNewLinkKey] = useState('')
  const [newLinkKeywords, setNewLinkKeywords] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')

  // Simulator Preview State (Static vs Interactive Sandbox)
  const [simMode, setSimMode] = useState<'interactive' | 'static'>('interactive')
  const [previewTab, setPreviewTab] = useState<'greeting' | 'followup' | 'completion'>('greeting')

  // Interactive Simulator Live State
  const [simHistory, setSimHistory] = useState<Array<{ role: string; content: string }>>([])
  const [simInput, setSimInput] = useState('')
  const [simLeadValues, setSimLeadValues] = useState<Record<string, string>>({})
  const [simIsComplete, setSimIsComplete] = useState(false)
  const [simIsTyping, setSimIsTyping] = useState(false)
  const chatCanvasRef = useRef<HTMLDivElement>(null)

  const fetchConfig = useCallback(async () => {
    try {
      fetch(`/api/customers/${id}`)
        .then(r => r.json())
        .then(d => { if (d.data?.name) setCustomerName(d.data.name) })
        .catch(() => {})

      const res = await fetch(`/api/customers/${id}/chat-settings`)
      const data = await res.json()
      if (data.data) {
        const d = data.data
        const presetKey = d.industry_preset || 'generic'
        const t = TEMPLATES[presetKey] || TEMPLATES.generic

        const configJson = (typeof d.config === 'object' && d.config !== null)
          ? d.config
          : (typeof d.config_json === 'object' && d.config_json !== null)
            ? d.config_json
            : {}

        setCfg(d)
        setPreset(presetKey)
        setEnabled(d.enabled ?? true)
        setTestModeEnabled(configJson.test_mode_enabled === true)
        setTestPhoneNumbers(configJson.test_phone_numbers || '')
        setBotMode((configJson.bot_mode as 'template' | 'custom') || 'template')
        setCustomWebhookUrl((configJson.custom_webhook_url as string) || '')
        setCustomWebhookSecret((configJson.custom_webhook_secret as string) || '')
        setCustomWebhookTimeoutMs((configJson.custom_webhook_timeout_ms as number) || 15000)
        setEditingFields(d.fields && d.fields.length > 0 ? d.fields : [...t.fields])
        
        setGreeting(d.templates?.greeting || t.default_greeting)
        setFollowup(d.templates?.followup || t.default_followup)
        setCompletion(d.templates?.completion || t.default_completion)
        setPricelistLinks(d.pricelist_links && Object.keys(d.pricelist_links).length > 0 ? d.pricelist_links : { ...t.default_pricelist_links })
      }
    } catch { } finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  // Scroll ONLY the inner chat canvas div to bottom (without scrolling the browser page)
  useEffect(() => {
    if (simMode === 'interactive' && chatCanvasRef.current) {
      chatCanvasRef.current.scrollTop = chatCanvasRef.current.scrollHeight
    }
  }, [simHistory, simMode])

  const applyTemplate = (key: string) => {
    const t = TEMPLATES[key]
    if (!t) return
    setPreset(key)
    setEditingFields([...t.fields])
    setGreeting(t.default_greeting)
    setFollowup(t.default_followup)
    setCompletion(t.default_completion)
    if (t.default_pricelist_links && Object.keys(t.default_pricelist_links).length > 0) {
      setPricelistLinks({ ...t.default_pricelist_links })
    }
    setMsg(`✅ Preset "${t.name}" diterapkan. Klik "Simpan Konfigurasi Bot" untuk mengaktifkan.`)
    handleResetSim()
  }

  const toast = useToast()

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/customers/${id}/chat-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry_preset: preset,
          enabled,
          test_mode_enabled: testModeEnabled,
          test_phone_numbers: testPhoneNumbers,
          bot_mode: botMode,
          custom_webhook_url: customWebhookUrl,
          custom_webhook_secret: customWebhookSecret,
          custom_webhook_timeout_ms: customWebhookTimeoutMs,
          fields: editingFields,
          templates: { greeting, followup, completion },
          pricelist_links: pricelistLinks,
        }),
      })
      if (!res.ok) throw new Error('Gagal menyimpan konfigurasi')
      setMsg('✅ Konfigurasi bot berhasil disimpan!')
      toast.success('Konfigurasi chatbot & link pricelist berhasil disimpan!')
      fetchConfig()
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Error'
      setMsg(`❌ ${errorText}`)
      toast.error(`Gagal menyimpan: ${errorText}`)
    } finally { setSaving(false) }
  }

  // Send message in Interactive Sandbox Chat with Typing Mode simulation
  const handleSendSimMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const userText = simInput.trim()
    if (!userText || simIsTyping) return

    setSimInput('')
    const nextHistory = [...simHistory, { role: 'user', content: userText }]
    setSimHistory(nextHistory)
    setSimIsTyping(true)

    setTimeout(() => {
      // Run Chat Engine using current UI state (fields, templates, pricelist_links)
      const result = handleChat(
        userText,
        nextHistory,
        simIsComplete ? ({ status: 'Booked', data_json: simLeadValues } as any) : null,
        {
          fields: editingFields,
          templates: { greeting, followup, completion },
          pricelist_links: pricelistLinks,
          business_name: customerName || 'Bisnis Anda',
        }
      )

      if (result.reply) {
        setSimHistory(prev => [...prev, { role: 'assistant', content: result.reply }])
      }

      if (result.leadData) {
        setSimLeadValues(result.leadData.field_values || {})
        if (result.leadData.is_complete) {
          setSimIsComplete(true)
        }
      }

      setSimIsTyping(false)
    }, 700)
  }

  // Reset Sandbox Chat
  const handleResetSim = () => {
    setSimHistory([])
    setSimInput('')
    setSimLeadValues({})
    setSimIsComplete(false)
  }

  // Open modal for Adding new field
  const handleOpenAddField = () => {
    setEditFieldIndex(null)
    setFieldLabel('')
    setFieldEmoji('📝')
    setFieldType('text')
    setFieldRequired(true)
    setFieldPlaceholder('')
    setShowFieldModal(true)
  }

  // Open modal for Editing existing field
  const handleOpenEditField = (idx: number) => {
    const f = editingFields[idx]
    if (!f) return
    setEditFieldIndex(idx)
    setFieldLabel(f.label)
    setFieldEmoji(f.emoji || '📝')
    setFieldType(f.type || 'text')
    setFieldRequired(f.required ?? true)
    setFieldPlaceholder(f.placeholder || '')
    setShowFieldModal(true)
  }

  // Save field from modal
  const handleSaveFieldModal = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fieldLabel.trim()) return

    const existingKey = editFieldIndex !== null ? editingFields[editFieldIndex]?.key : undefined
    const generatedKey = existingKey || fieldLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `field_${Date.now()}`

    const newField: BotField = {
      key: generatedKey,
      label: fieldLabel.trim(),
      emoji: fieldEmoji.trim() || '📝',
      type: fieldType,
      required: fieldRequired,
      placeholder: fieldPlaceholder.trim() || undefined,
    }

    if (editFieldIndex !== null) {
      setEditingFields(prev => {
        const next = [...prev]
        next[editFieldIndex] = newField
        return next
      })
    } else {
      setEditingFields(prev => [...prev, newField])
    }

    setShowFieldModal(false)
  }

  // Remove field
  const removeField = (idx: number) => {
    setEditingFields(f => f.filter((_, i) => i !== idx))
  }

  // Dynamic Pricelist Link Rule Adder
  const addPricelistLink = () => {
    if (!newLinkKey.trim() || !newLinkUrl.trim()) return
    
    let storedKey = newLinkKey.trim()
    if (newLinkKeywords.trim()) {
      storedKey = `${newLinkKey.trim()} [${newLinkKeywords.trim()}]`
    }

    setPricelistLinks(prev => ({
      ...prev,
      [storedKey]: newLinkUrl.trim(),
    }))
    setNewLinkKey('')
    setNewLinkKeywords('')
    setNewLinkUrl('')
  }

  const removePricelistLink = (key: string) => {
    setPricelistLinks(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const getTypeNameInIndonesian = (type: string) => {
    switch (type) {
      case 'date': return 'Tanggal / Jadwal'
      case 'location': return 'Lokasi / Alamat'
      case 'keyword': return 'Deteksi Kata Kunci (Keyword)'
      default: return 'Teks Bebas'
    }
  }

  // Evaluate template variables for static live preview
  const evaluatePreviewMessage = (templateText: string, mode: 'greeting' | 'followup' | 'completion') => {
    const bName = customerName || 'Nama Bisnis Anda'
    
    const fieldFormsText = editingFields
      .map(f => `${f.emoji} *${f.label}* ${f.required ? '(wajib)' : '(opsional)'}:`)
      .join('\n')

    const missingFieldsText = editingFields
      .filter((_, i) => i >= 1)
      .map(f => `${f.emoji} *${f.label}* ${f.required ? '(wajib)' : '(opsional)'}:`)
      .join('\n') || (editingFields[0] ? `${editingFields[0].emoji} *${editingFields[0].label}*:` : '')

    // Simulated answers for sample preview
    const sampleFieldValues: Record<string, string> = {
      name: 'Reynaldi',
      event_type: 'Wedding',
      venue_type: 'Gedung',
      service: 'Perawatan Gigi',
      item_type: 'Mobil MPV',
    }

    const fieldSummaryText = editingFields
      .map(f => {
        const val = sampleFieldValues[f.key] || 'Contoh Jawaban'
        return `${f.emoji} *${f.label}*: ${val}`
      })
      .join('\n')

    let result = templateText
      .replace(/\{\{\s*business_name\s*\}\}/g, bName)
      .replace(/\{\{\s*name\s*\}\}/g, 'Reynaldi')

    if (mode === 'completion') {
      result = result.replace(/\{\{\s*field_summary\s*\}\}/g, fieldSummaryText)
      
      const matched = findMatchingPricelistLink(sampleFieldValues, pricelistLinks)
      if (matched && matched.url && !result.includes(matched.url)) {
        result += `\n\n📄 *Link Katalog (${matched.title}):*\n${matched.url}`
      }
    } else if (mode === 'followup') {
      result = result.replace(/\{\{\s*missing_fields\s*\}\}/g, missingFieldsText)
    } else {
      result = result.replace(/\{\{\s*field_forms\s*\}\}/g, fieldFormsText)
    }

    return result
  }

  // Render WhatsApp markdown (*bold*)
  const renderWhatsAppText = (text: string) => {
    const parts = text.split(/(\*[^*]+\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return <strong key={i} className="font-bold text-white">{part.slice(1, -1)}</strong>
      }
      return part
    })
  }

  if (loading) return <div className="text-zinc-500 p-8">Memuat konfigurasi bot...</div>

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        {!hideBackButton && (
          <Link href={`/dashboard/customers/${id}`} className="text-zinc-400 hover:text-white text-xs mb-2 inline-block">← Kembali ke Detail Customer</Link>
        )}
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          🤖 Bot & Chatbot Settings
        </h1>
        <p className="text-zinc-400 text-xs mt-1">
          Atur preset industri, pesan greeting, pertanyaan lead, dan link katalog produk otomatis untuk WhatsApp Anda.
        </p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-xs font-medium ${msg.startsWith('✅') ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
          {msg}
        </div>
      )}

      {/* Enable toggle */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="font-semibold text-white text-sm">Status Auto-Reply Chatbot</h2>
          <p className="text-zinc-400 text-xs mt-0.5">Aktifkan untuk merespon pesan WhatsApp masuk secara otomatis</p>
        </div>
        <button
          onClick={() => setEnabled(e => !e)}
          className={`w-14 h-8 rounded-full relative transition-colors shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
        >
          <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform shadow ${enabled ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Live WhatsApp Testing Whitelist Mode Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <span>🧪 Mode Testing WhatsApp Live (Whitelisted Testers)</span>
            </h2>
            <p className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
              Aktifkan mode testing agar Bot <strong>hanya membalas pesan dari nomor HP tester/pribadi Anda</strong>. Chat dari pelanggan asli lainnya tidak akan dibalas bot dan langsung masuk ke Live Inbox.
            </p>
          </div>
          <button
            onClick={() => setTestModeEnabled(e => !e)}
            className={`w-14 h-8 rounded-full relative transition-colors shrink-0 ${testModeEnabled ? 'bg-amber-500' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform shadow ${testModeEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        {testModeEnabled && (
          <div className="pt-2 space-y-2 border-t border-zinc-800">
            <label className="block text-xs font-semibold text-amber-400">
              Nomor WhatsApp Tester (pisahkan dengan koma jika lebih dari 1):
            </label>
            <input
              type="text"
              value={testPhoneNumbers}
              onChange={(e) => setTestPhoneNumbers(e.target.value)}
              placeholder="Contoh: 085156266871, 08123456789"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[11px] text-zinc-400">
              💡 *Catatan: Masukkan nomor HP pribadi Anda (misal 085156266871). Bot WhatsApp di nomor bisnis akan membalas otomatis <strong>KHUSUS</strong> ketika Anda mengirim pesan dari nomor tersebut.*
            </p>
          </div>
        )}
      </div>

      {/* Bot Mode Toggle */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-white text-sm flex items-center gap-2">⚙️ Mode Bot</h2>
          <p className="text-zinc-400 text-xs mt-0.5">Pilih cara bot Anda merespon pesan masuk WhatsApp</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setBotMode('template')}
            className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.01] ${
              botMode === 'template'
                ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🤖</span>
              {botMode === 'template' && (
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">Aktif</span>
              )}
            </div>
            <div className="font-semibold text-sm text-white">Template Mode</div>
            <div className="text-xs text-zinc-400 mt-1">Chatbot otomatis menggunakan template greeting, lead collector, dan pricelist bawaan Chatin</div>
          </button>

          <button
            onClick={() => setBotMode('custom')}
            className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.01] ${
              botMode === 'custom'
                ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30'
                : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">⚡</span>
              {botMode === 'custom' && (
                <span className="text-[10px] font-bold bg-violet-500/20 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full">Aktif</span>
              )}
            </div>
            <div className="font-semibold text-sm text-white">Custom Logic</div>
            <div className="text-xs text-zinc-400 mt-1">Dikelola langsung oleh Admin Chatin untuk alur bot kustom (integrasi sistem/AI)</div>
          </button>
        </div>
      </div>

      {/* Custom Webhook Configuration & Client Contact Banner (when mode = custom) */}
      {botMode === 'custom' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-white text-base flex items-center gap-2">
              <span>⚡</span> Custom Bot Logic
            </h2>
            <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
              Bot WhatsApp Anda berjalan menggunakan logika bisnis kustom yang disesuaikan khusus dengan kebutuhan operasional Anda.
            </p>
          </div>

          {/* Status Box */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-semibold text-zinc-300">Status Integrasi Logic Bot:</span>
              {customWebhookUrl ? (
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Custom Engine Terhubung & Aktif
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Menunggu Setup dari Admin
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Seluruh alur percakapan, integrasi sistem (seperti pencatatan otomatis, rekomendasi AI, sistem kasir, dll.), dan balasan bot ditangani langsung oleh server kustom bisnis Anda.
            </p>
          </div>

          {/* Client Call-To-Action Banner */}
          <div className="bg-gradient-to-r from-violet-950/40 via-zinc-900 to-violet-950/20 border border-violet-500/30 rounded-2xl p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>💬</span> Ingin Mengubah Logic / Konsultasi Fitur Custom Baru?
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Klien tidak perlu repot melakukan setup teknis atau webhook. Tim Admin Chatin yang akan membantu mengatur seluruh alur & koneksi sistem untuk Anda.
              </p>
            </div>

            <div className="pt-1">
              <a
                href="https://wa.me/6285156266871?text=Halo%20Admin%20Chatin,%20saya%20ingin%20konsultasi%20pembuatan/perubahan%20Custom%20Logic%20Bot%20untuk%20bisnis%20saya."
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 rounded-xl text-xs transition shadow-lg shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="text-base">💬</span>
                <span>Hubungi Admin Chatin via WhatsApp (+6285156266871)</span>
              </a>
            </div>
          </div>

          {/* Admin-Only Developer Settings (Visible ONLY for coderey.wiki@gmail.com) */}
          {isAdmin && (
            <div className="pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setShowDevSettings(s => !s)}
                  className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1.5 transition py-1"
                >
                  <span>{showDevSettings ? '🔽' : '⚙️'}</span>
                  <span className="underline underline-offset-4">
                    {showDevSettings ? 'Sembunyikan Pengaturan Webhook (Admin View)' : 'Pengaturan Webhook & Developer (Khusus Superadmin)'}
                  </span>
                </button>
                <span className="text-[10px] font-bold font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2.5 py-0.5 rounded-full">
                  🛡️ Superadmin ({userEmail})
                </span>
              </div>

              {showDevSettings && (
              <div className="mt-4 p-5 bg-zinc-950/90 border border-zinc-800 rounded-2xl space-y-5">
                <div>
                  <h3 className="font-semibold text-white text-xs flex items-center gap-2">🔧 Developer Webhook Setup</h3>
                  <p className="text-zinc-500 text-[11px] mt-0.5">Konfigurasi URL server eksternal (misal: Flowku bot API pada port 8700)</p>
                </div>

                <div className="space-y-4">
                  {/* Webhook URL */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">🔗 Webhook URL <span className="text-red-400">*</span></label>
                    <input
                      type="url"
                      value={customWebhookUrl}
                      onChange={(e) => setCustomWebhookUrl(e.target.value)}
                      placeholder="https://your-api.com/chatin/process"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 font-mono"
                    />
                    <p className="text-[11px] text-zinc-500 mt-1">Endpoint API yang menerima POST request dengan payload {'{"phone": "62xxx", "text": "...", "type": "text"}'}</p>
                  </div>

                  {/* Webhook Secret */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">🔑 Webhook Secret</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customWebhookSecret}
                        onChange={(e) => setCustomWebhookSecret(e.target.value)}
                        placeholder="chsec_your_secret_here"
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
                          const secret = 'chsec_' + Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
                          setCustomWebhookSecret(secret)
                          toast.success('Secret key baru di-generate!')
                        }}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-xl border border-zinc-700 transition shrink-0"
                      >
                        🔄 Generate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(customWebhookSecret)
                          toast.success('Secret key disalin ke clipboard!')
                        }}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-xl border border-zinc-700 transition shrink-0"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">Dikirim sebagai header <code className="text-violet-400">X-Chatin-Secret</code> ke endpoint Anda untuk verifikasi keamanan</p>
                  </div>

                  {/* Timeout */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">⏱️ Timeout (ms)</label>
                    <input
                      type="number"
                      value={customWebhookTimeoutMs}
                      onChange={(e) => setCustomWebhookTimeoutMs(Number(e.target.value) || 15000)}
                      min={3000}
                      max={60000}
                      step={1000}
                      className="w-40 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
                    />
                    <p className="text-[11px] text-zinc-500 mt-1">Waktu maksimum menunggu respons dari server Anda (default: 15000ms = 15 detik)</p>
                  </div>
                </div>

                {/* Test Webhook Button */}
                <div className="pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    disabled={!customWebhookUrl || testingWebhook}
                    onClick={async () => {
                      setTestingWebhook(true)
                      setWebhookTestResult(null)
                      try {
                        const res = await fetch(`/api/customers/${id}/chat-settings/test-webhook`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            url: customWebhookUrl,
                            secret: customWebhookSecret,
                            phone: '6285156266871',
                            text: '50rb makan siang',
                          }),
                        })
                        const data = await res.json()
                        setWebhookTestResult(data)
                        if (data.ok) {
                          toast.success('Webhook test berhasil! Koneksi OK.')
                        } else {
                          toast.error(`Webhook test gagal: ${data.error || 'Status ' + data.status}`)
                        }
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Test failed'
                        setWebhookTestResult({ ok: false, error: msg })
                        toast.error(`Webhook test error: ${msg}`)
                      } finally {
                        setTestingWebhook(false)
                      }
                    }}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition shadow-md shadow-violet-500/10"
                  >
                    {testingWebhook ? (
                      <><span className="animate-spin">⏳</span> Testing...</>
                    ) : (
                      <>🧪 Test Webhook Connection</>
                    )}
                  </button>

                  {webhookTestResult && (
                    <div className={`mt-3 p-3 rounded-xl text-xs border ${
                      webhookTestResult.ok
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      {webhookTestResult.ok ? (
                        <div className="space-y-1">
                          <div className="font-semibold">✅ Koneksi berhasil!</div>
                          {webhookTestResult.reply && (
                            <div className="mt-1 p-2 bg-zinc-900 rounded-lg text-zinc-300 font-mono text-[11px] whitespace-pre-wrap">
                              Reply: {webhookTestResult.reply}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="font-semibold">❌ Gagal: {webhookTestResult.error || 'Unknown error'}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Payload Preview */}
                <div className="pt-3 border-t border-zinc-800">
                  <h4 className="text-xs font-semibold text-zinc-400 mb-2">📦 Format Payload JSON:</h4>
                  <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[11px] text-zinc-300 font-mono overflow-x-auto">{JSON.stringify({
                    phone: '6285156266871',
                    text: '50rb makan siang',
                    type: 'text',
                    contact_name: 'Reynaldi',
                    customer_id: 'cus_xxx',
                    message_id: 'wamid.xxx',
                    timestamp: '2026-08-18T10:00:00Z',
                  }, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Industry Template Selector (Template Mode Only) */}
      {botMode === 'template' && (<>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">📋 Industry Preset & Template</h2>
            <p className="text-zinc-400 text-xs mt-0.5">Pilih industri Anda untuk mengisi otomatis Pertanyaan, Greeting, Follow-up, & Handover yang paling cocok</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.values(TEMPLATES).map(t => {
            const isSelected = preset === t.key
            return (
              <button
                key={t.key}
                onClick={() => applyTemplate(t.key)}
                className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.01] ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                    : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{t.icon}</span>
                  {isSelected && (
                    <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Aktif
                    </span>
                  )}
                </div>
                <div className="font-semibold text-sm text-white">{t.name}</div>
                <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{t.description}</div>
                <div className="text-[11px] text-emerald-400 mt-2 font-medium">
                  ⚡ Klik untuk terapkan preset
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Fields Editor */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold text-white text-sm">🏷️ Data Pertanyaan Lead Collector</h2>
            <p className="text-zinc-400 text-xs mt-0.5">Daftar pertanyaan yang akan diajukan chatbot secara otomatis kepada calon pembeli.</p>
          </div>
          <button
            onClick={handleOpenAddField}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3.5 py-2 rounded-xl text-xs transition shadow-md shadow-emerald-500/10 shrink-0"
          >
            <span>+ Tambah Pertanyaan</span>
          </button>
        </div>

        {editingFields.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-zinc-800 rounded-xl space-y-3">
            <div className="text-2xl">📝</div>
            <p className="text-zinc-400 text-xs">Belum ada pertanyaan field. Klik tombol di bawah atau pilih preset industri di atas.</p>
            <button
              onClick={handleOpenAddField}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition inline-block border border-zinc-700"
            >
              + Tambah Pertanyaan Baru
            </button>
          </div>
        ) : (
          <div className="space-y-2 mt-4">
            {editingFields.map((f, idx) => (
              <div key={f.key + idx} className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800/80 rounded-xl px-4 py-3 group hover:border-zinc-700 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">{f.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-white flex items-center gap-2 truncate">
                      {f.label}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-300 bg-zinc-800/60 px-2 py-0.5 rounded text-[10px]">Tipe: {getTypeNameInIndonesian(f.type)}</span>
                      {f.required ? (
                        <span className="text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded text-[10px]">Wajib</span>
                      ) : (
                        <span className="text-zinc-500 bg-zinc-800/40 px-2 py-0.5 rounded text-[10px]">Opsional</span>
                      )}
                      {f.placeholder && (
                        <span className="text-zinc-500 truncate max-w-[200px]">Hint: {f.placeholder}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleOpenEditField(idx)}
                    className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-lg transition border border-zinc-700/60"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => removeField(idx)}
                    className="text-xs text-zinc-500 hover:text-red-400 p-1 transition"
                    title="Hapus Pertanyaan"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Greeting & Followup & Completion Templates */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-white text-sm">💬 Template Pesan Otomatis</h2>
            <p className="text-zinc-400 text-xs mt-0.5">Pesan yang otomatis dikirim chatbot ke WhatsApp calon pembeli di setiap tahapan</p>
          </div>
          {TEMPLATES[preset] && (
            <button
              onClick={() => {
                const t = TEMPLATES[preset]
                setGreeting(t.default_greeting)
                setFollowup(t.default_followup)
                setCompletion(t.default_completion)
                setMsg(`🔄 Template pesan di-reset ke preset "${t.name}".`)
              }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-xl transition"
            >
              🔄 Reset Pesan ke Preset {TEMPLATES[preset].name}
            </button>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-zinc-300 mb-1 block">1. Greeting (Awal Chat Masuk)</label>
            <p className="text-[11px] text-zinc-500 mb-2">Variabel otomatis: <code className="text-emerald-400">{'{'}{'{'}business_name{'}'}{'}'}</code> dan <code className="text-emerald-400">{'{'}{'{'}field_forms{'}'}{'}'}</code></p>
            <textarea
              value={greeting}
              onChange={e => setGreeting(e.target.value)}
              rows={5}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs text-white placeholder-zinc-600 font-mono leading-relaxed focus:outline-none focus:border-zinc-700"
              placeholder="Halo Kak! 👋 Selamat datang di {{business_name}}..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-300 mb-1 block">2. Follow-up (Jika Data Belum Lengkap)</label>
            <p className="text-[11px] text-zinc-500 mb-2">Variabel otomatis: <code className="text-emerald-400">{'{'}{'{'}business_name{'}'}{'}'}</code> dan <code className="text-emerald-400">{'{'}{'{'}missing_fields{'}'}{'}'}</code></p>
            <textarea
              value={followup}
              onChange={e => setFollowup(e.target.value)}
              rows={4}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs text-white placeholder-zinc-600 font-mono leading-relaxed focus:outline-none focus:border-zinc-700"
              placeholder="Terima kasih infonya Kak! 😊 Boleh dilengkapi lagi ya Kak..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-emerald-400 mb-1 block">
              3. Completion & Handover Admin (Jika Data Terkumpul Semua ✨)
            </label>
            <p className="text-[11px] text-zinc-500 mb-2">
              Pesan saat data lengkap & memberi tahu pelanggan bahwa percakapan akan dilanjutkan langsung oleh Admin.{' '}
              Variabel: <code className="text-emerald-400">{'{'}{'{'}business_name{'}'}{'}'}</code>, <code className="text-emerald-400">{'{'}{'{'}name{'}'}{'}'}</code>, dan <code className="text-emerald-400">{'{'}{'{'}field_summary{'}'}{'}'}</code>
            </p>
            <textarea
              value={completion}
              onChange={e => setCompletion(e.target.value)}
              rows={5}
              className="w-full bg-zinc-950 border border-emerald-500/40 rounded-xl p-4 text-xs text-white placeholder-zinc-600 font-mono leading-relaxed focus:outline-none focus:border-emerald-500 shadow-inner"
              placeholder="Terima kasih banyak Kak {{name}}! Data sudah kami catat..."
            />
          </div>
        </div>
      </div>

      {/* DYNAMIC INTERACTIVE WHATSAPP SANDBOX & PREVIEW */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <span>📱</span> Simulasi Chat Interaktif (WhatsApp Sandbox)
            </h2>
            <p className="text-zinc-400 text-xs mt-0.5">
              Uji coba bot secara langsung seolah Anda adalah calon pelanggan yang sedang berkirim pesan ke WhatsApp {customerName}.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-xl gap-1 shrink-0">
            <button
              onClick={() => setSimMode('interactive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                simMode === 'interactive'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>🧪 Live Chat Sandbox</span>
            </button>
            <button
              onClick={() => setSimMode('static')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                simMode === 'static'
                  ? 'bg-zinc-800 text-white font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>👁️ Preview Template</span>
            </button>
          </div>
        </div>

        {/* MODE 1: INTERACTIVE LIVE SANDBOX CHAT */}
        {simMode === 'interactive' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* WhatsApp Mobile Frame Mockup */}
            <div className="lg:col-span-2 bg-[#0b141a] border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[520px]">
              {/* WhatsApp Header */}
              <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between border-b border-[#222d34] shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm border border-emerald-400/40 shrink-0">
                    {customerName[0]?.toUpperCase() || 'W'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                      {customerName || 'Bisnis Anda'}
                      <span className="text-[10px] text-emerald-400">✓</span>
                    </div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                      Bot Active (Live Sandbox)
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetSim}
                  className="text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-2.5 py-1 rounded-xl transition flex items-center gap-1 shrink-0"
                  title="Mulai Ulang Percakapan Tes"
                >
                  <span>🔄 Reset Chat</span>
                </button>
              </div>

              {/* Interactive Chat Canvas Container (Scrolled internally only) */}
              <div ref={chatCanvasRef} className="flex-1 p-4 space-y-3 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px] overflow-y-auto">
                {simHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 my-auto">
                    <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-2xl">
                      💬
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Mulai Percakapan Tes</div>
                      <p className="text-[11px] text-zinc-400 mt-1 max-w-xs leading-relaxed">
                        Ketik pesan pertama sebagai pembeli (contoh: <code className="text-emerald-400">"Halo min mau tanya info"</code>) di kotak pesan di bawah untuk menguji respon bot secara langsung!
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center pt-2">
                      {[
                        'Halo kak, mau tanya pricelist',
                        'Halo min',
                        'Mau boking buat bulan depan',
                      ].map((sample) => (
                        <button
                          key={sample}
                          type="button"
                          onClick={() => {
                            setSimInput(sample)
                          }}
                          className="text-[10px] bg-[#202c33] hover:bg-zinc-700 text-emerald-300 border border-zinc-700 px-2.5 py-1 rounded-full transition"
                        >
                          "{sample}"
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  simHistory.map((item, idx) => {
                    const isCustomerUser = item.role === 'user'
                    return (
                      <div
                        key={idx}
                        className={`flex ${isCustomerUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-xs max-w-[88%] shadow-md whitespace-pre-wrap leading-relaxed ${
                            isCustomerUser
                              ? 'bg-[#005c4b] text-zinc-100 rounded-tr-none border border-emerald-500/30'
                              : 'bg-[#202c33] text-zinc-200 rounded-tl-none border border-zinc-700/40'
                          }`}
                        >
                          <div>{renderWhatsAppText(item.content)}</div>
                          <div
                            className={`text-[9px] text-right mt-1 flex items-center justify-end gap-1 ${
                              isCustomerUser ? 'text-emerald-200/70' : 'text-zinc-400'
                            }`}
                          >
                            <span>10:45</span>
                            {isCustomerUser && <span className="text-emerald-300">✓✓</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                {simIsTyping && (
                  <div className="flex justify-start">
                    <div className="bg-[#202c33] text-emerald-400 rounded-2xl rounded-tl-none px-4 py-2 text-xs border border-zinc-700/40 flex items-center gap-1.5 shadow">
                      <span className="font-semibold text-[11px]">sedang mengetik</span>
                      <span className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Textarea Bar (Supports Enter to send, Shift+Enter for new line) */}
              <form onSubmit={handleSendSimMessage} className="bg-[#202c33] px-3 py-2.5 border-t border-[#222d34] flex items-center gap-2 shrink-0">
                <textarea
                  value={simInput}
                  onChange={e => setSimInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendSimMessage()
                    }
                  }}
                  rows={1}
                  placeholder="Ketik pesan pelanggan (Enter untuk kirim, Shift+Enter untuk baris baru)..."
                  className="flex-1 bg-[#111b21] border border-zinc-700/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none max-h-24 leading-relaxed"
                />
                <button
                  type="submit"
                  disabled={!simInput.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-xs transition disabled:opacity-40 shrink-0 flex items-center gap-1 shadow"
                >
                  <span>Kirim</span>
                  <span>🚀</span>
                </button>
              </form>
            </div>

            {/* Live Extracted Lead Inspection Panel */}
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div>
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>📊 Lead Collector State</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    simIsComplete
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : Object.keys(simLeadValues).length > 0
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {simIsComplete ? '✅ LENGKAP & HANDOVER' : Object.keys(simLeadValues).length > 0 ? '⏳ Mengumpulkan Data' : 'Belum Ada Chat'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  Data calon pembeli yang berhasil dideteksi dan diekstrak secara otomatis oleh parser:
                </p>
              </div>

              <div className="space-y-2">
                {editingFields.map(f => {
                  const val = simLeadValues[f.key]
                  return (
                    <div key={f.key} className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
                      <span className="text-zinc-300 font-medium flex items-center gap-1.5 truncate">
                        <span>{f.emoji}</span>
                        <span>{f.label}</span>
                      </span>
                      {val ? (
                        <span className="text-emerald-400 font-semibold truncate max-w-[140px] text-right bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          {val}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[11px] italic">Belum terisi</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {simIsComplete && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <span>✨ Handover to Admin</span>
                  </div>
                  <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                    Seluruh pertanyaan wajib telah terjawab. Status percakapan ini kini dialihkan ke Admin CS di Live Inbox.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* MODE 2: STATIC PREVIEW MODE */
          <div className="space-y-4">
            <div className="flex justify-end">
              <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-xl gap-1 shrink-0 flex-wrap">
                <button
                  onClick={() => setPreviewTab('greeting')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    previewTab === 'greeting' ? 'bg-emerald-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Greeting
                </button>
                <button
                  onClick={() => setPreviewTab('followup')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    previewTab === 'followup' ? 'bg-emerald-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Follow-up
                </button>
                <button
                  onClick={() => setPreviewTab('completion')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    previewTab === 'completion' ? 'bg-emerald-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Handover Admin ✨
                </button>
              </div>
            </div>

            <div className="max-w-md mx-auto bg-[#0b141a] border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="bg-[#202c33] px-4 py-3 flex items-center gap-3 border-b border-[#222d34]">
                <div className="w-9 h-9 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm border border-emerald-400/40">
                  {customerName[0]?.toUpperCase() || 'W'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                    {customerName || 'Bisnis Anda'}
                    <span className="text-[10px] text-emerald-400">✓</span>
                  </div>
                  <div className="text-[10px] text-emerald-400">Official WhatsApp Business Bot</div>
                </div>
              </div>

              <div className="p-4 space-y-3 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px] min-h-[300px]">
                <div className="flex justify-start">
                  <div className="bg-[#202c33] text-zinc-200 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs max-w-[85%] border border-zinc-700/40">
                    <p>
                      {previewTab === 'completion'
                        ? 'Sudah saya isi semua kak datanya...'
                        : previewTab === 'followup'
                        ? 'Nama saya Reynaldi kak...'
                        : 'Halo kak, mau tanya info dan harganya...'}
                    </p>
                    <div className="text-[9px] text-zinc-400 text-right mt-0.5">10:45</div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="bg-[#005c4b] text-zinc-100 rounded-2xl rounded-tr-none px-3.5 py-2.5 text-xs max-w-[88%] shadow-md border border-emerald-500/30">
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {renderWhatsAppText(
                        evaluatePreviewMessage(
                          previewTab === 'greeting' ? greeting : previewTab === 'followup' ? followup : completion,
                          previewTab
                        )
                      )}
                    </div>
                    <div className="text-[9px] text-emerald-200/70 text-right mt-1.5 flex items-center justify-end gap-1">
                      <span>10:45</span>
                      <span className="text-emerald-300">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* DYNAMIC PRICELIST LINKS & RULES MANAGER */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-white text-sm mb-1 flex items-center gap-2">
            <span>🔗</span> Link Katalog & Rule Pricelist Otomatis (Dinamis untuk Semua Industri)
          </h2>
          <p className="text-zinc-400 text-xs leading-relaxed">
            Atur link katalog yang dikirimkan ke pembeli. Anda dapat menentukan **kata kunci kondisi** untuk setiap link (misal: kata kunci <code className="text-emerald-400">wedding, gedung</code> atau <code className="text-emerald-400">alphard</code> atau <code className="text-emerald-400">gigi</code>) sehingga link dikirim secara otomatis sesuai jawaban pembeli.
          </p>
        </div>

        {/* Added Links Table */}
        <div className="space-y-2.5">
          {Object.entries(pricelistLinks).length === 0 ? (
            <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-xs">
              Belum ada link katalog. Tambahkan link katalog produk/jasa Anda di bawah.
            </div>
          ) : (
            Object.entries(pricelistLinks).map(([storedKey, url]) => {
              const kwMatch = storedKey.match(/\[(.*?)\]/)
              const cleanTitle = storedKey.replace(/\[.*?\]/, '').trim()
              const keywordsList = kwMatch ? kwMatch[1].split(',').map(k => k.trim()) : []

              return (
                <div key={storedKey} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3.5 hover:border-zinc-700 transition">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white font-semibold">{cleanTitle}</span>
                      {keywordsList.map(kw => (
                        <span key={kw} className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                          🔑 {kw}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-zinc-400 font-mono truncate">{url}</div>
                  </div>

                  <button
                    onClick={() => removePricelistLink(storedKey)}
                    className="text-xs text-zinc-500 hover:text-red-400 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1 rounded-lg transition self-end sm:self-center"
                  >
                    ✕ Hapus
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Dynamic Link Add Form */}
        <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-white">➕ Tambah Link Katalog Baru:</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-400 mb-1 block">Judul Paket / Katalog</label>
              <input
                type="text"
                placeholder="Contoh: Katalog Wedding Gedung / Paket Mobil Alphard"
                value={newLinkKey}
                onChange={e => setNewLinkKey(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 mb-1 block">Kata Kunci Kondisi (Opsional)</label>
              <input
                type="text"
                placeholder="Contoh: wedding, gedung (pisah koma)"
                value={newLinkKeywords}
                onChange={e => setNewLinkKeywords(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 mb-1 block">URL Link Katalog (PDF / Canva / Website)</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://catalog.bisnisanda.com/pricelist"
                value={newLinkUrl}
                onChange={e => setNewLinkUrl(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
              />
              <button
                type="button"
                onClick={addPricelistLink}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs transition border border-emerald-400/40 shrink-0"
              >
                + Simpan Link
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              💡 *Jika kata kunci diisi, bot akan mencocokkan kata kunci tersebut dengan balasan calon pembeli untuk memilih link yang paling sesuai.*
            </p>
          </div>
        </div>
      </div>
      </>)}

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-6 py-3 rounded-xl text-xs transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : '💾 Simpan Konfigurasi Bot'}
        </button>
      </div>

      {/* MODAL DIALOG FOR ADDING / EDITING FIELD */}
      {showFieldModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-white text-base">
                {editFieldIndex !== null ? '✏️ Edit Pertanyaan' : '➕ Tambah Pertanyaan Baru'}
              </h3>
              <button
                onClick={() => setShowFieldModal(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFieldModal} className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3">
                  <label className="text-xs font-semibold text-zinc-300 mb-1 block">Label Pertanyaan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Tanggal Acara / Ukuran Sepatu / Budget"
                    value={fieldLabel}
                    onChange={e => setFieldLabel(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-zinc-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-300 mb-1 block text-center">Emoji</label>
                  <input
                    type="text"
                    placeholder="📅"
                    value={fieldEmoji}
                    onChange={e => setFieldEmoji(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1 block">Tipe Jawaban</label>
                <select
                  value={fieldType}
                  onChange={e => setFieldType(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                >
                  <option value="text">Teks Bebas (Nama, Catatan, Keterangan)</option>
                  <option value="date">Tanggal / Jadwal (Contoh: 20 Oktober / Besok)</option>
                  <option value="location">Lokasi / Alamat (Pengiriman / Venue)</option>
                  <option value="keyword">Pilihan Kata Kunci / Keyword (Deteksi Otomatis)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1 block">Status Pertanyaan</label>
                <select
                  value={fieldRequired ? 'true' : 'false'}
                  onChange={e => setFieldRequired(e.target.value === 'true')}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                >
                  <option value="true">Wajib Diisi (Required)</option>
                  <option value="false">Opsional (Boleh Dikosongi Customer)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1 block">Petunjuk Contoh Isian (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: 20 Oktober 2026 / Gedung / Rumah"
                  value={fieldPlaceholder}
                  onChange={e => setFieldPlaceholder(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none placeholder-zinc-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowFieldModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs transition"
                >
                  {editFieldIndex !== null ? 'Simpan Perubahan' : 'Tambah Pertanyaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
