'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewCustomerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [hasExistingTenant, setHasExistingTenant] = useState(false)
  const [existingTenantId, setExistingTenantId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    async function checkExisting() {
      try {
        const res = await fetch('/api/customers')
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.data) && data.data.length > 0) {
            setHasExistingTenant(true)
            setExistingTenantId(data.data[0].id)
          }
        }
      } catch {
        // ignore
      } finally {
        setChecking(false)
      }
    }
    checkExisting()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create customer')
      }

      router.push(`/dashboard/customers/${data.data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="max-w-lg p-12 text-center text-zinc-500">
        Memeriksa status tenant akun...
      </div>
    )
  }

  if (hasExistingTenant) {
    return (
      <div className="max-w-lg">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-xl mx-auto">
            ✓
          </div>
          <h2 className="text-xl font-bold text-white">Single-Tenant Mode (Akun Terhubung)</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Akun Chatin Anda telah terhubung dengan 1 Tenant WhatsApp. Sistem Chatin saat ini dikonfigurasi dalam <strong>Mode Single-Tenant per User</strong>.
          </p>
          <div className="pt-4 flex flex-col gap-2">
            {existingTenantId && (
              <button
                onClick={() => router.push(`/dashboard/customers/${existingTenantId}`)}
                className="w-full bg-white text-zinc-900 font-semibold py-3 rounded-xl hover:bg-zinc-100 transition text-sm"
              >
                Buka Pengaturan Tenant Terhubung
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard/customers')}
              className="w-full bg-zinc-800 text-zinc-300 font-medium py-3 rounded-xl hover:bg-zinc-700 transition text-sm"
            >
              Kembali ke Daftar Tenant
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Connect WhatsApp Business</h1>
        <p className="text-zinc-400">Hubungkan bisnis Anda untuk mengaktifkan WhatsApp Business API</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-500/10 text-red-400 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            Nama Bisnis <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Sebelas Decor"
            className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            Email Bisnis (opsional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@sebelasdecor.com"
            className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-zinc-800 text-zinc-100 rounded-xl py-3 font-semibold hover:bg-zinc-700 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-white text-zinc-900 rounded-xl py-3 font-semibold hover:bg-zinc-100 transition disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Connect Business'}
          </button>
        </div>
      </form>
    </div>
  )
}
