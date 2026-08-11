import { getDb } from '@/lib/db'
import Link from 'next/link'

interface MessageLog {
  id: string
  customer_id: string
  phone_number_id: string
  to_number: string
  type: string
  status: string
  content: string
  error: string | null
  created_at: string
  customer_name: string | null
}

interface Stats {
  total: number
  sent: number
  delivered: number
  pending: number
  failed: number
}

export default function MessagesPage({
  searchParams,
}: {
  searchParams: { customer_id?: string }
}) {
  const customerId = searchParams.customer_id
  const db = getDb()

  // Fetch messages
  let query = 'SELECT ml.*, c.name as customer_name FROM message_logs ml LEFT JOIN customers c ON ml.customer_id = c.id'
  const params: (string | number)[] = []

  if (customerId) {
    query += ' WHERE ml.customer_id = ?'
    params.push(customerId)
  }

  query += ' ORDER BY ml.created_at DESC LIMIT 100'
  const messages = db.prepare(query).all(...params) as MessageLog[]

  // Stats
  const statsQuery = customerId
    ? db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM message_logs WHERE customer_id = ?
      `).get(customerId) as Stats | undefined
    : db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM message_logs
      `).get() as Stats | undefined

  // Customers for filter
  const customers = db.prepare('SELECT id, name FROM customers ORDER BY name').all() as { id: string; name: string }[]

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">Message Logs</h1>
          <p className="text-zinc-400">
            {customerId ? `Messages for ${customers.find(c => c.id === customerId)?.name || customerId}` : 'All messages sent via platform'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-zinc-900 rounded-xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Total</div>
          <div className="text-2xl font-bold">{statsQuery?.total || 0}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Sent</div>
          <div className="text-2xl font-bold text-blue-400">{statsQuery?.sent || 0}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Delivered</div>
          <div className="text-2xl font-bold text-green-400">{statsQuery?.delivered || 0}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Pending</div>
          <div className="text-2xl font-bold text-yellow-400">{statsQuery?.pending || 0}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Failed</div>
          <div className="text-2xl font-bold text-red-400">{statsQuery?.failed || 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dashboard/messages"
            className={`px-3 py-1 rounded-lg text-sm ${
              !customerId ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            All customers
          </Link>
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/messages?customer_id=${c.id}`}
              className={`px-3 py-1 rounded-lg text-sm ${
                customerId === c.id ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Message list */}
      {messages.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl p-12 text-center text-zinc-500">
          <p className="text-lg mb-2">📭 Belum ada message</p>
          <p className="text-sm">
            {customerId
              ? 'Belum ada pesan untuk customer ini'
              : 'Pesan yang dikirim lewat dashboard akan muncul di sini'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-3 px-2">To</th>
                <th className="text-left py-3 px-2">Customer</th>
                <th className="text-left py-3 px-2">Type</th>
                <th className="text-left py-3 px-2">Status</th>
                <th className="text-left py-3 px-2">Content</th>
                <th className="text-right py-3 px-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.id} className="border-b border-zinc-800 hover:bg-zinc-900/50">
                  <td className="py-3 px-2 font-mono text-xs">{msg.to_number}</td>
                  <td className="py-3 px-2">
                    {msg.customer_id ? (
                      <Link
                        href={`/dashboard/customers/${msg.customer_id}`}
                        className="text-white hover:underline"
                      >
                        {msg.customer_name || msg.customer_id}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-xs">
                      {msg.type}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      msg.status === 'delivered' ? 'bg-green-500/20 text-green-400' :
                      msg.status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                      msg.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      msg.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    }`}>
                      {msg.status}
                    </span>
                  </td>
                  <td className="py-3 px-2 max-w-xs truncate text-zinc-400">
                    {msg.content?.slice(0, 80) || '-'}
                    {msg.error && <div className="text-red-400 text-xs">{msg.error.slice(0, 50)}</div>}
                  </td>
                  <td className="py-3 px-2 text-right text-zinc-500 text-xs">
                    {new Date(msg.created_at).toLocaleString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
