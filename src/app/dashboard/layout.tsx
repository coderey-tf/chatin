import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { UserNav } from './UserNav'

export const metadata: Metadata = {
  title: 'Chatin Dashboard',
  description: 'Multi-tenant WhatsApp dashboard via KirimDev',
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const userEmail = user?.email
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navigation */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6 md:gap-8">
              <Link href="/dashboard" className="text-xl font-bold tracking-tight flex items-center gap-2">
                <span>📱</span>
                <span>Chatin</span>
              </Link>
              <div className="hidden md:flex items-center gap-6 text-sm">
                <Link
                  href="/dashboard"
                  className="text-zinc-400 hover:text-white transition font-medium"
                >
                  Overview
                </Link>
                <Link
                  href="/dashboard/inbox"
                  className="text-zinc-400 hover:text-white transition font-medium flex items-center gap-1.5"
                >
                  <span>💬</span> Inbox
                </Link>
                <Link
                  href="/dashboard/customers"
                  className="text-zinc-400 hover:text-white transition font-medium"
                >
                  Customers
                </Link>
                <Link
                  href="/dashboard/messages"
                  className="text-zinc-400 hover:text-white transition font-medium"
                >
                  Messages
                </Link>
                <Link
                  href="/dashboard/billing"
                  className="text-zinc-400 hover:text-white transition font-medium flex items-center gap-1"
                >
                  <span>💳</span> Billing
                </Link>
                <Link
                  href="/dashboard/customers/new"
                  className="text-zinc-400 hover:text-white transition font-medium"
                >
                  + Customer
                </Link>
              </div>
            </div>

            {/* Right user nav */}
            <UserNav email={userEmail} name={userName} avatarUrl={avatarUrl} />
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
