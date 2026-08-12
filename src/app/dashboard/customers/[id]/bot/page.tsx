'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { INDUSTRY_TEMPLATES, type BotField } from '@/lib/industry-templates'

interface BotConfigData {
  industry_preset: string
  enabled: boolean
  fields: BotField[]
  templates: { greeting: string; followup: string }
  pricelist_links: Record<string, string>
}

const TEMPLATES = INDUSTRY_TEMPLATES

export default function BotSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [cfg, setCfg] = useState<BotConfigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editingFields, setEditingFields] = useState<BotField[]>([])
  const [showFieldModal, setShowFieldModal] = useState(false)
  const [editFieldIdx, setEditFieldIdx] = useState<number | null>(null)

  const [greeting, setGreeting] = useState('')
  const [followup, setFollowup] = useState('')
  const [pricelistLinks, setPricelistLinks] = useState<Record<string, string>>({})
  const [preset, setPreset] = useState('generic')
  const [enabled, setEnabled] = useState(true)

  const [newLinkKey, setNewLinkKey] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}/chat-settings`)
      const data = await res.json()
      if (data.data) {
        const d = data.data
        setCfg(d)
        setPreset(d.industry_preset || 'generic')
        setEnabled(d.enabled ?? true)
        setEditingFields(d.fields || [])
        setGreeting(d.templates?.greeting || '')
        setFollowup(d.templates?.followup || '')
        setPricelistLinks(d.pricelist_links || {})
      }
    } catch { } finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const applyTemplate = (key: string) => {
    const t = TEMPLATES[key]
    if (!t) return
    setPreset(key)
    setEditingFields([...t.fields])
    setMsg(`✅ Template "${t.name}" diterapkan ke field. Klik Simpan untuk menyimpan.`)
  }

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
          fields: editingFields,
          templates: { greeting, followup },
          pricelist_links: pricelistLinks,
        }),
      })
      if (!res.ok) throw new Error('Gagal simpan')
      setMsg('✅ Bot config tersimpan!')
      fetchConfig()
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Error'}`)
    } finally { setSaving(false) }
  }

  const addField = () => {
    setEditFieldIdx(null)
    setShowFieldModal(true)
  }

  const removeField = (idx: number) => {
    setEditingFields(f => f.filter((_, i) => i !== idx))
  }

  if (loading) return <div className="text-zinc-500">Loading...</div>

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <Link href={`/dashboard/customers/${id}`} className="text-zinc-400 hover:text-white text-sm mb-3 inline-block">← Back to customer</Link>
        <h1 className="text-2xl font-bold mb-1">🤖 Bot Settings</h1>
        <p className="text-zinc-500">Konfigurasi chatbot otomatis: field yang dikumpulkan, greeting, pricelist</p>
      </div>

      {msg && <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${msg.startsWith('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>{msg}</div>}

      {/* Enable toggle */}
      <div className="bg-zinc-900 rounded-xl p-6 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Bot Status</h2>
          <p className="text-zinc-500 text-sm">Aktif/nonaktifkan chatbot untuk customer ini</p>
        </div>
        <button onClick={() => setEnabled(e => !e)}
          className={`w-14 h-8 rounded-full relative transition-colors ${enabled ? 'bg-green-500' : 'bg-zinc-700'}`}>
          <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform shadow ${enabled ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Industry Template Selector */}
      <div className="bg-zinc-900 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">📋 Industry Template</h2>
        <p className="text-zinc-500 text-sm mb-4">Pilih template untuk auto-generate field yang perlu dikumpulkan dari customer</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.values(TEMPLATES).map(t => (
            <button key={t.key} onClick={() => applyTemplate(t.key)}
              className={`p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                preset === t.key ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-800 hover:border-zinc-600'
              }`}>
              <div className="text-2xl mb-1">{t.icon}</div>
              <div className="font-medium text-sm">{t.name}</div>
              <div className="text-xs text-zinc-500 mt-1">{t.fields.length} fields</div>
            </button>
          ))}
        </div>
      </div>

      {/* Fields Editor */}
      <div className="bg-zinc-900 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">🏷️ Data yang Dikumpulkan</h2>
          <button onClick={addField} className="text-sm bg-zinc-800 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition">+ Add Field</button>
        </div>
        <p className="text-zinc-500 text-sm mb-4">Field yang akan ditanyakan bot ke customer. Bisa edit/hapus/add sesuai kebutuhan.</p>

        {editingFields.length === 0 ? (
          <div className="text-center py-8 text-zinc-600">Belum ada field. Pilih template atau klik + Add Field</div>
        ) : (
          <div className="space-y-2">
            {editingFields.map((f, idx) => (
              <div key={f.key + idx} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-4 py-3">
                <span className="text-xl">{f.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{f.label}</div>
                  <div className="text-xs text-zinc-500">
                    <code className="bg-zinc-700 px-1 rounded mr-2">{f.key}</code>
                    <span className="mr-2">{f.type}</span>
                    {f.required && <span className="text-yellow-400">required</span>}
                    {f.type === 'keyword' && f.keywords && (
                      <span className="text-zinc-600 ml-2">→ {Object.keys(f.keywords).join(' / ')}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => removeField(idx)} className="text-zinc-500 hover:text-red-400 text-sm p-1" title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Greeting & Followup Template */}
      <div className="bg-zinc-900 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">💬 Template Pesan</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Greeting (awal chat)</label>
            <p className="text-xs text-zinc-600 mb-2">Variabel: {'{{business_name}}'} {'{{field_forms}}'}</p>
            <textarea value={greeting} onChange={e => setGreeting(e.target.value)} rows={5}
              className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 font-mono" placeholder="Halo Kak! 👋 Selamat datang di {{business_name}}..." />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Follow-up (field belum lengkap)</label>
            <p className="text-xs text-zinc-600 mb-2">Variabel: {'{{business_name}}'} {'{{missing_fields}}'}</p>
            <textarea value={followup} onChange={e => setFollowup(e.target.value)} rows={4}
              className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 font-mono" placeholder="Boleh dilengkapi lagi ya Kak..." />
          </div>
        </div>
      </div>

      {/* Pricelist Links */}
      <div className="bg-zinc-900 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">📄 Pricelist Links</h2>
        <p className="text-zinc-500 text-sm mb-4">Link yang dikirim setelah data lengkap. Key = label kategori (ex: "Wedding Gedung"), Value = URL</p>
        <div className="space-y-2 mb-4">
          {Object.entries(pricelistLinks).map(([key, url]) => (
            <div key={key} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
              <span className="text-sm font-medium text-blue-400 w-40 shrink-0">{key}</span>
              <input value={url} onChange={e => setPricelistLinks(l => ({...l, [key]: e.target.value}))}
                className="flex-1 bg-zinc-700 rounded px-2 py-1 text-xs font-mono text-white" />
              <button onClick={() => setPricelistLinks(l => { const n = {...l}; delete n[key]; return n })}
                className="text-zinc-500 hover:text-red-400 p-1 text-sm">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newLinkKey} onChange={e => setNewLinkKey(e.target.value)} placeholder="Kategori (ex: Wedding Gedung)"
            className="w-40 bg-zinc-800 rounded-lg px-3 py-2 text-sm placeholder-zinc-600" />
          <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="https://..."
            className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-sm placeholder-zinc-600 font-mono" />
          <button onClick={() => { if (newLinkKey && newLinkUrl) { setPricelistLinks(l => ({...l, [newLinkKey]: newLinkUrl})); setNewLinkKey(''); setNewLinkUrl('') } }}
            className="bg-zinc-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-zinc-700 transition">+ Add</button>
        </div>
      </div>

      {/* Save button */}
      <div className="flex gap-3 mb-6">
        <button onClick={save} disabled={saving}
          className="bg-white text-zinc-900 px-8 py-3 rounded-xl font-semibold hover:bg-zinc-100 transition disabled:opacity-50">
          {saving ? 'Menyimpan...' : '💾 Simpan Semua'}
        </button>
      </div>

      {/* API Preview */}
      <div className="bg-zinc-900 rounded-xl p-6">
        <h2 className="font-semibold mb-4">📡 API Preview</h2>
        <p className="text-zinc-500 text-sm mb-3">Untuk integrasi, gunakan endpoint ini:</p>
        <div className="bg-zinc-800 rounded-lg p-4 font-mono text-xs text-green-400 mb-3">
          POST https://chatin.coderey.dev/api/chat{'\n'}
          {'  '}Content-Type: application/json{'\n'}
          {'  '}&#123;"message": "Halo", "customer_id": "{id}", "phone": "+628xxx"&#125;
        </div>
        <div className="bg-zinc-800 rounded-lg p-4 font-mono text-xs text-blue-400">
          Response:&#123;"reply": "...", "autoReply": true/false, "handoverToAdmin": false&#125;
        </div>
      </div>

      {/* Field Modal */}
      {showFieldModal && <FieldModal fields={editingFields} idx={editFieldIdx} onClose={() => setShowFieldModal(false)}
        onSave={(f, idx) => {
          if (idx !== null && idx !== undefined) {
            setEditingFields(prev => prev.map((x, i) => i === idx ? f : x))
          } else {
            setEditingFields(prev => [...prev, f])
          }
          setShowFieldModal(false)
        }} />}
    </div>
  )
}

function FieldModal({ fields, idx, onClose, onSave }: {
  fields: BotField[]
  idx: number | null
  onClose: () => void
  onSave: (f: BotField, idx: number | null) => void
}) {
  const existing = idx !== null ? fields[idx] : null
  const [key, setKey] = useState(existing?.key || '')
  const [label, setLabel] = useState(existing?.label || '')
  const [emoji, setEmoji] = useState(existing?.emoji || '💬')
  const [type, setType] = useState<BotField['type']>(existing?.type || 'text')
  const [required, setRequired] = useState(existing?.required ?? true)
  const [optionsStr, setOptionsStr] = useState(existing?.options?.join(', ') || '')
  const [keywordsStr, setKeywordsStr] = useState(
    existing?.keywords ? Object.entries(existing.keywords).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n') : ''
  )
  const [defaultValue, setDefaultValue] = useState(existing?.default_value || '')

  const save = () => {
    if (!key || !label) return
    const f: BotField = { key, label, emoji, type, required, default_value: defaultValue || undefined }

    if (type === 'keyword' && keywordsStr.trim()) {
      f.keywords = {}
      keywordsStr.split('\n').forEach(line => {
        const [val, kws] = line.split(':')
        if (val && kws) f.keywords![val.trim()] = kws.split(',').map(k => k.trim()).filter(Boolean)
      })
    }
    if (type === 'select' && optionsStr.trim()) {
      f.options = optionsStr.split(',').map(o => o.trim()).filter(Boolean)
    }
    if (defaultValue) f.default_value = defaultValue

    onSave(f, idx)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-lg border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-lg mb-4">{idx !== null ? 'Edit Field' : '+ Add Field'}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <input value={key} onChange={e => setKey(e.target.value)} placeholder="key (ex: name)" className="bg-zinc-800 rounded-lg px-3 py-2 text-sm" />
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (ex: Nama)" className="bg-zinc-800 rounded-lg px-3 py-2 text-sm" />
            <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="Emoji" className="bg-zinc-800 rounded-lg px-3 py-2 text-sm w-16 text-center" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Type</label>
              <select value={type} onChange={e => setType(e.target.value as BotField['type'])} className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm">
                <option value="text">Text (free text)</option>
                <option value="keyword">Keyword (detect via keywords)</option>
                <option value="select">Select (fixed options)</option>
                <option value="date">Date (Indonesian)</option>
                <option value="location">Location (Indonesian cities)</option>
              </select>
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} className="rounded" />
                Required
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Default value (optional)</label>
            <input value={defaultValue} onChange={e => setDefaultValue(e.target.value)} placeholder="Belum pasti"
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          {type === 'keyword' && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Keywords (satu per baris: Value: keyword1, keyword2, ...)</label>
              <textarea value={keywordsStr} onChange={e => setKeywordsStr(e.target.value)} rows={4}
                className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm font-mono" placeholder={"Wedding: nikah, wedding, resepsi\nEngagement: lamaran, engagement, tunangan"} />
            </div>
          )}
          {type === 'select' && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Options (comma separated)</label>
              <input value={optionsStr} onChange={e => setOptionsStr(e.target.value)} placeholder="Pria, Wanita"
                className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition">Batal</button>
          <button onClick={save} disabled={!key || !label}
            className="bg-white text-zinc-900 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-100 transition disabled:opacity-40">Simpan</button>
        </div>
      </div>
    </div>
  )
}
