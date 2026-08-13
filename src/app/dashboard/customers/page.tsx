import { listCustomers } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch all customers for this user (to check single-tenant count)
  const allUserCustomers = await listCustomers(undefined, user?.id, user?.email ?? undefined)
  const filteredCustomers = status ? allUserCustomers.filter(c => c.status === status) : allUserCustomers

  const hasExistingTenant = allUserCustomers.length >= 1

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Tenant & Akun WhatsApp</h1>
          <p className="text-zinc-400 text-sm">Kelola tenant dan koneksi nomor WhatsApp bisnis Anda</p>
        </div>
        {hasExistingTenant ? (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <span>✓ Single-Tenant Mode (1 WABA Connected)</span>
          </div>
        ) : (
          <Link
            href="/dashboard/customers/new"
            className="bg-white text-zinc-900 px-4 py-2.5 rounded-xl font-semibold hover:bg-zinc-100 transition text-sm"
          >
            + Connect WhatsApp Business
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <Link
          href="/dashboard/customers"
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
            !status ? 'bg-white text-zinc-900 font-semibold' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
          }`}
        >
          All
        </Link>
        <Link
          href="/dashboard/customers?status=pending"
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
            status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
          }`}
        >
          Pending
        </Link>
        <Link
          href="/dashboard/customers?status=active"
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
            status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
          }`}
        >
          Active
        </Link>
        <Link
          href="/dashboard/customers?status=archived"
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
            status === 'archived' ? 'bg-zinc-500/20 text-zinc-400 border border-zinc-700' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
          }`}
        >
          Archived
        </Link>
      </div>

      {/* Customer list */}
      {filteredCustomers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">
          <p className="mb-4">Belum ada tenant WhatsApp{status ? ` dengan status "${status}"` : ''}</p>
          {!hasExistingTenant && (
            <Link
              href="/dashboard/customers/new"
              className="bg-white text-zinc-900 px-4 py-2 rounded-xl font-semibold hover:bg-zinc-100 transition text-sm"
            >
              + Connect WhatsApp Business
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredCustomers.map((customer) => (
            <Link
              key={customer.id}
              href={`/dashboard/customers/${customer.id}`}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/60 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg text-white">{customer.name}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      customer.status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                      customer.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                      'bg-zinc-500/20 text-zinc-400 border border-zinc-700'
                    }`}>
                      {customer.status}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-400">
                    {customer.email || 'No email'} • <span className="font-mono text-xs text-zinc-500">{customer.id}</span>
                  </div>
                  {customer.phone_number && (
                    <div className="text-sm text-zinc-300 mt-1">
                      📱 {customer.phone_number}
                    </div>
                  )}
                </div>
                <div className="text-right text-sm text-zinc-500">
                  <div>{new Date(customer.created_at).toLocaleDateString('id-ID')}</div>
                  <div className="text-xs mt-1">{customer.phone_number_id ? '🟢 Connected' : '⏳ Not connected'}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
