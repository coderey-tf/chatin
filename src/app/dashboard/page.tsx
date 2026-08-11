import { listCustomers } from '@/lib/db'
import Link from 'next/link'

export default function DashboardPage() {
  const customers = listCustomers()
  const stats = {
    total: customers.length,
    active: customers.filter(c => c.status === 'active').length,
    pending: customers.filter(c => c.status === 'pending').length,
    archived: customers.filter(c => c.status === 'archived').length,
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-zinc-400">Overview WhatsApp multi-tenant management</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-900 rounded-xl p-6">
          <div className="text-zinc-500 text-sm mb-1">Total Customers</div>
          <div className="text-3xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-6">
          <div className="text-zinc-500 text-sm mb-1">Active</div>
          <div className="text-3xl font-bold text-green-400">{stats.active}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-6">
          <div className="text-zinc-500 text-sm mb-1">Pending</div>
          <div className="text-3xl font-bold text-yellow-400">{stats.pending}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-6">
          <div className="text-zinc-500 text-sm mb-1">Archived</div>
          <div className="text-3xl font-bold text-zinc-500">{stats.archived}</div>
        </div>
      </div>

      {/* Recent customers */}
      <div className="bg-zinc-900 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Customers</h2>
          <Link
            href="/dashboard/customers"
            className="text-sm text-zinc-400 hover:text-white transition"
          >
            View all →
          </Link>
        </div>

        {customers.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <p className="mb-4">Belum ada customer</p>
            <Link
              href="/dashboard/customers/new"
              className="bg-white text-zinc-900 px-4 py-2 rounded-lg font-semibold hover:bg-zinc-100 transition"
            >
              + Add Customer
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-3 px-2">Name</th>
                  <th className="text-left py-3 px-2">Status</th>
                  <th className="text-left py-3 px-2">Phone</th>
                  <th className="text-left py-3 px-2">Created</th>
                  <th className="text-right py-3 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.slice(0, 5).map((customer) => (
                  <tr key={customer.id} className="border-b border-zinc-800">
                    <td className="py-3 px-2">{customer.name}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        customer.status === 'active' ? 'bg-green-500/20 text-green-400' :
                        customer.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-zinc-500/20 text-zinc-400'
                      }`}>
                        {customer.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-zinc-400">
                      {customer.phone_number || '-'}
                    </td>
                    <td className="py-3 px-2 text-zinc-400">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className="text-white hover:text-green-400 transition"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
