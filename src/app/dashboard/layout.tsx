import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Chatin Dashboard',
  description: 'Multi-tenant WhatsApp dashboard via KirimDev',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navigation */}
      <nav className="border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-xl font-bold">
                📱 Chatin
              </Link>
              <Link
                href="/dashboard"
                className="text-zinc-400 hover:text-white transition"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/customers"
                className="text-zinc-400 hover:text-white transition"
              >
                Customers
              </Link>
              <Link
                href="/dashboard/messages"
                className="text-zinc-400 hover:text-white transition"
              >
                Messages
              </Link>
              <Link
                href="/dashboard/customers/new"
                className="text-zinc-400 hover:text-white transition"
              >
                + Add Customer
              </Link>
            </div>
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
