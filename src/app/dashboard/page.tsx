import { listCustomers, getDashboardStats } from '@/lib/db'
import Link from 'next/link'

export default async function DashboardPage() {
  const [customers, dbStats] = await Promise.all([
    listCustomers(),
    getDashboardStats(),
  ])

  const stats = [
    { label: 'Total Customers', value: dbStats.totalCustomers, color: 'text-white' },
    { label: 'Customer Active', value: dbStats.activeCustomers, color: 'text-green-400' },
    { label: 'Total Leads', value: dbStats.totalLeads, color: 'text-blue-400' },
    { label: 'Leads Hari Ini', value: dbStats.todayLeads, color: 'text-emerald-400' },
    { label: 'Total Messages', value: dbStats.totalMessages, color: 'text-purple-400' },
    { label: 'Messages Hari Ini', value: dbStats.todayMessages, color: 'text-amber-400' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-zinc-400 text-sm">Overview WhatsApp multi-tenant management & stats</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent customers */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
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
              className="bg-white text-zinc-900 px-4 py-2 rounded-xl font-semibold hover:bg-zinc-100 transition text-sm"
            >
              + Add Customer
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-3 px-3">Name</th>
                  <th className="text-left py-3 px-3">Status</th>
                  <th className="text-left py-3 px-3">Phone</th>
                  <th className="text-left py-3 px-3">Created</th>
                  <th className="text-right py-3 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.slice(0, 8).map((customer) => (
                  <tr key={customer.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                    <td className="py-3 px-3 font-medium text-white">{customer.name}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        customer.status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        customer.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                        'bg-zinc-500/20 text-zinc-400 border border-zinc-700'
                      }`}>
                        {customer.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      {customer.phone_number || '-'}
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      {new Date(customer.created_at).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-3 text-xs">
                        <Link
                          href={`/dashboard/customers/${customer.id}/bot`}
                          className="text-zinc-400 hover:text-white transition"
                        >
                          🤖 Bot
                        </Link>
                        <Link
                          href={`/dashboard/customers/${customer.id}/leads`}
                          className="text-zinc-400 hover:text-white transition"
                        >
                          📊 Leads
                        </Link>
                        <Link
                          href={`/dashboard/customers/${customer.id}`}
                          className="text-white font-medium hover:underline transition"
                        >
                          Detail →
                        </Link>
                      </div>
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
