'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginFormInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (!res.ok) {
        setError('Token salah. Coba lagi.')
        setLoading(false)
        return
      }

      // Cookie set by API — now redirect
      router.push(redirect)
    } catch {
      setError('Gagal menghubungi server.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="max-w-sm w-full bg-zinc-900 rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💬</div>
          <h1 className="text-2xl font-bold">Chatin</h1>
          <p className="text-zinc-500 text-sm mt-1">Login to Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 text-red-400 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Masukkan auth token..."
            className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
            autoFocus
          />

          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full bg-white text-zinc-900 rounded-xl py-3 font-semibold hover:bg-zinc-100 transition disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
      <p className="text-zinc-500">Loading...</p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginFormInner />
    </Suspense>
  )
}
