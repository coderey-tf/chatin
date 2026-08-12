'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function UserNav({ email, name, avatarUrl }: { email?: string; name?: string; avatarUrl?: string }) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const supabase = createClient()

  const handleLogout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = name || email?.split('@')[0] || 'User'

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 text-sm text-zinc-300">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={displayName} className="w-8 h-8 rounded-full border border-zinc-700 object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-white">
            {displayName[0]?.toUpperCase()}
          </div>
        )}
        <span className="hidden sm:inline font-medium text-xs">{displayName}</span>
      </div>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white px-3 py-1.5 rounded-xl transition disabled:opacity-50"
      >
        {loggingOut ? 'Logging out...' : 'Logout 🚪'}
      </button>
    </div>
  )
}
