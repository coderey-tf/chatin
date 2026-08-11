import { listCustomers } from '@/lib/db'
import Link from 'next/link'

export default function CustomersPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const status = searchParams.status
  const customers = listCustomers(status)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">Customers</h1>
          <p className="text-zinc-400">Manage your WhatsApp tenants</p>
        </div>
        <Link
          href="/dashboard/customers/new"
          className="bg-white text-zinc-900 px-4 py-2 rounded-lg font-semibold hover:bg-zinc-100 transition"
        >
          + Add Customer
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <Link
          href="/dashboard/customers"
          className={`px-3 py-1 rounded-lg text-sm ${
            !status ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          All
        </Link>
        <Link
          href="/dashboard/customers?status=pending"
          className={`px-3 py-1 rounded-lg text-sm ${
            status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          Pending
        </Link>
        <Link
          href="/dashboard/customers?status=active"
          className={`px-3 py-1 rounded-lg text-sm ${
            status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          Active
        </Link>
        <Link
          href="/dashboard/customers?status=archived"
          className={`px-3 py-1 rounded-lg text-sm ${
            status === 'archived' ? 'bg-zinc-500/20 text-zinc-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          Archived
        </Link>
      </div>

      {/* Customer list */}
      {customers.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl p-12 text-center text-zinc-500">
          <p className="mb-4">Belum ada customer{status ? ` dengan status "${status}"` : ''}</p>
          <Link
            href="/dashboard/customers/new"
            className="bg-white text-zinc-900 px-4 py-2 rounded-lg font-semibold hover:bg-zinc-100 transition"
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
              className="bg-zinc-900 rounded-xl p-6 hover:bg-zinc-800 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{customer.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      customer.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      customer.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    }`}>
                      {customer.status}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500">
                    {customer.email || 'No email'} • {customer.id}
                  </div>
                  {customer.phone_number && (
                    <div className="text-sm text-zinc-400 mt-1">
                      📱 {customer.phone_number}
                    </div>
                  )}
                </div>
                <div className="text-right text-sm text-zinc-500">
                  <div>{new Date(customer.created_at).toLocaleDateString()}</div>
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
