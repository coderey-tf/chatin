'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { INDUSTRY_TEMPLATES } from '@/lib/industry-templates'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [industryPreset, setIndustryPreset] = useState('wedding_decor')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCompleteOnboarding = async () => {
    if (!businessName.trim()) {
      setError('Nama bisnis wajib diisi')
      setStep(1)
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          email,
          phone,
          industryPreset,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyelesaikan onboarding')
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(msg)
      setLoading(false)
    }
  }

  const selectedPreset = INDUSTRY_TEMPLATES[industryPreset as keyof typeof INDUSTRY_TEMPLATES] || INDUSTRY_TEMPLATES.generic

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans">
      
      {/* Top Header */}
      <div className="max-w-2xl w-full mx-auto flex items-center justify-between py-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-xl flex items-center justify-center text-zinc-950 font-black text-lg shadow-lg shadow-emerald-500/20">
            C
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight text-lg">Chatin</h1>
            <p className="text-[11px] text-zinc-500">Setup WhatsApp Business API Anda</p>
          </div>
        </div>

        <div className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
          Langkah {step} dari 3
        </div>
      </div>

      {/* Main Wizard Form Container */}
      <div className="max-w-2xl w-full mx-auto my-8 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur relative overflow-hidden">
        
        {/* Step Progress Line */}
        <div className="grid grid-cols-3 gap-2 mb-8">
          <div className={`h-1.5 rounded-full transition-all ${step >= 1 ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
          <div className={`h-1.5 rounded-full transition-all ${step >= 2 ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
          <div className={`h-1.5 rounded-full transition-all ${step >= 3 ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3.5 text-xs mb-6">
            {error}
          </div>
        )}

        {/* STEP 1: Profil & Kategori Bisnis */}
        {step === 1 && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Selamat Datang! 👋 Apa nama bisnis Anda?</h2>
              <p className="text-xs text-zinc-400 mt-1">Kami akan mengonfigurasi otomatis sistem chatbot sesuai industri bisnis Anda.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Nama Bisnis / Usaha *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sebelas Decor / Klinik Mitra Sehat"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full bg-zinc-800/80 rounded-xl px-4 py-3 text-white placeholder-zinc-500 border border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Email Kontak Bisnis (Opsional)</label>
                <input
                  type="email"
                  placeholder="kontak@bisnisanda.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-800/80 rounded-xl px-4 py-3 text-white placeholder-zinc-500 border border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Pilih Industri Bisnis *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(INDUSTRY_TEMPLATES).map(([key, item]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIndustryPreset(key)}
                      className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                        industryPreset === key
                          ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                          : 'bg-zinc-800/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <div>
                        <div className="font-semibold text-xs text-white">{item.name}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">{item.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                disabled={!businessName.trim()}
                onClick={() => setStep(2)}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-2"
              >
                <span>Lanjut ke Step 2</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Koneksi WhatsApp WABA */}
        {step === 2 && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Koneksi WhatsApp Business API</h2>
              <p className="text-xs text-zinc-400 mt-1">Masukkan nomor WhatsApp bisnis Anda atau gunakan mode simulasi untuk pengujian.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Nomor WhatsApp Bisnis (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: +6281234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-zinc-800/80 rounded-xl px-4 py-3 text-white placeholder-zinc-500 border border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm font-mono"
                />
              </div>

              <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <span>🚀 Official BSP Meta Cloud API</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  WhatsApp Business API resmi via KirimDev BSP mendukung pendaftaran Meta Embedded Signup langsung dari dashboard setelah onboarding selesai.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-zinc-400 hover:text-white text-xs font-semibold"
              >
                ← Kembali
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-xs transition flex items-center gap-2"
              >
                <span>Lanjut ke Step 3</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Preview Chatbot & Finish */}
        {step === 3 && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Review Preset Chatbot {selectedPreset.name}</h2>
              <p className="text-xs text-zinc-400 mt-1">Chatbot Anda sudah siap otomatis mengumpulkan calon pembeli (leads) dari pesan masuk WhatsApp.</p>
            </div>

            <div className="space-y-4">
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Preview Pesan Salam Auto-Reply</div>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 whitespace-pre-line leading-relaxed font-sans">
                  {selectedPreset.default_greeting}
                </div>
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5">Field Informasi Terkumpul</div>
                <div className="flex flex-wrap gap-2">
                  {selectedPreset.fields.map((f) => (
                    <span key={f.key} className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg flex items-center gap-1.5">
                      <span>{f.emoji}</span>
                      <span>{f.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                disabled={loading}
                onClick={() => setStep(2)}
                className="text-zinc-400 hover:text-white text-xs font-semibold"
              >
                ← Kembali
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleCompleteOnboarding}
                className="bg-gradient-to-r from-emerald-500 to-teal-400 text-zinc-950 font-bold px-8 py-3 rounded-xl text-xs transition shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <span>Menyiapkan Dashboard...</span>
                ) : (
                  <>
                    <span>Selesaikan & Masuk Dashboard</span>
                    <span>🚀</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="text-center text-xs text-zinc-600">
        © Chatin WABA Gateway. Multi-tenant WhatsApp Business API.
      </div>

    </div>
  )
}
