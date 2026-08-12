import { listCustomers } from '@/lib/db'
import Link from 'next/link'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const customers = await listCustomers(status)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Customers</h1>
          <p className="text-zinc-400 text-sm">Manage your WhatsApp tenants</p>
        </div>
        <Link
          href="/dashboard/customers/new"
          className="bg-white text-zinc-900 px-4 py-2.5 rounded-xl font-semibold hover:bg-zinc-100 transition text-sm"
        >
          + Add Customer
        </Link>
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
      {customers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">
          <p className="mb-4">Belum ada customer{status ? ` dengan status "${status}"` : ''}</p>
          <Link
            href="/dashboard/customers/new"
            className="bg-white text-zinc-900 px-4 py-2 rounded-xl font-semibold hover:bg-zinc-100 transition text-sm"
          >
            + Add Customer
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {customers.map((customer) => (
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
