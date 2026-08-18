'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error Boundary]:', error)
    // If Next.js chunk load error (happens after new deployment/build), auto hard refresh
    if (error?.message?.includes('Failed to load chunk') || error?.message?.includes('Loading chunk')) {
      window.location.reload()
    }
  }, [error])

  const handleRetry = () => {
    if (error?.message?.includes('chunk') || error?.message?.includes('Loading')) {
      window.location.reload()
    } else {
      reset()
    }
  }

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold mb-2 text-white">Terjadi Kesalahan</h2>
        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
          {error.message || 'Gagal memuat halaman dashboard.'}
        </p>
        <button
          onClick={handleRetry}
          className="bg-white text-zinc-900 font-bold px-6 py-2.5 rounded-xl hover:bg-zinc-100 transition text-sm shadow-md"
        >
          Coba Lagi / Refresh Halaman
        </button>
      </div>
    </div>
  )
}
