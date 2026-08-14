import { listCustomers } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

interface MessageLog {
  id: string
  customer_id: string
  phone_number_id: string
  to_number: string
  contact_phone?: string | null
  type: string
  status: string
  content: string
  error: string | null
  created_at: string
  customer_name: string | null
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string }>
}) {
  const { customer_id: paramCustomerId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const userCustomers = await listCustomers(undefined, user?.id, user?.email ?? undefined)
  const activeCustomer = userCustomers[0]
  const customerId = paramCustomerId || activeCustomer?.id

  const sb = createAdminClient()

  // Fetch messages scoped to user customer
  let query = sb
    .from('message_logs')
    .select('*, customers(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data: rawMessages } = await query
  const messages: MessageLog[] = (rawMessages || []).map((m) => ({
    ...m,
    customer_name: (m.customers as { name: string } | null)?.name || null,
  }))

  // Stats
  let statsQueryTotal = sb.from('message_logs').select('*', { count: 'exact', head: true })
  let statsQuerySent = sb.from('message_logs').select('*', { count: 'exact', head: true }).eq('status', 'sent')
  let statsQueryDelivered = sb.from('message_logs').select('*', { count: 'exact', head: true }).eq('status', 'delivered')
  let statsQueryPending = sb.from('message_logs').select('*', { count: 'exact', head: true }).eq('status', 'pending')
  let statsQueryFailed = sb.from('message_logs').select('*', { count: 'exact', head: true }).eq('status', 'failed')

  if (customerId) {
    statsQueryTotal = statsQueryTotal.eq('customer_id', customerId)
    statsQuerySent = statsQuerySent.eq('customer_id', customerId)
    statsQueryDelivered = statsQueryDelivered.eq('customer_id', customerId)
    statsQueryPending = statsQueryPending.eq('customer_id', customerId)
    statsQueryFailed = statsQueryFailed.eq('customer_id', customerId)
  }

  const [{ count: total }, { count: sent }, { count: delivered }, { count: pending }, { count: failed }] = await Promise.all([
    statsQueryTotal,
    statsQuerySent,
    statsQueryDelivered,
    statsQueryPending,
    statsQueryFailed,
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <span>📜</span> Audit Log Pesan
          </h1>
          <p className="text-zinc-400 text-sm">
            Audit trail semua pesan WhatsApp yang dikirim & diterima oleh bisnis Anda ({activeCustomer?.name || 'Bisnis Anda'})
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Total</div>
          <div className="text-2xl font-bold">{total || 0}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Sent</div>
          <div className="text-2xl font-bold text-blue-400">{sent || 0}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Delivered</div>
          <div className="text-2xl font-bold text-green-400">{delivered || 0}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Pending</div>
          <div className="text-2xl font-bold text-yellow-400">{pending || 0}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-zinc-500 text-xs mb-1">Failed</div>
          <div className="text-2xl font-bold text-red-400">{failed || 0}</div>
        </div>
      </div>

      {/* Message list */}
      {messages.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">
          <p className="text-lg mb-2">📭 Belum ada message</p>
          <p className="text-sm text-zinc-400">
            Belum ada riwayat pesan masuk atau keluar untuk bisnis Anda
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-3 px-4">To / Phone</th>
                  <th className="text-left py-3 px-4">Customer</th>
                  <th className="text-left py-3 px-4">Type</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Content</th>
                  <th className="text-right py-3 px-4">Time</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-mono text-xs text-white">{msg.to_number || msg.contact_phone || '-'}</td>
                    <td className="py-3 px-4">
                      {msg.customer_id ? (
                        <Link
                          href={`/dashboard/customers/${msg.customer_id}`}
                          className="text-white hover:underline font-medium"
                        >
                          {msg.customer_name || msg.customer_id}
                        </Link>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-0.5 rounded-full text-xs">
                        {msg.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        msg.status === 'delivered' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                        msg.status === 'sent' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                        msg.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                        msg.status === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                        'bg-zinc-500/20 text-zinc-400 border-zinc-700'
                      }`}>
                        {msg.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-zinc-300">
                      {msg.content?.slice(0, 80) || '-'}
                      {msg.error && <div className="text-red-400 text-xs mt-0.5">{msg.error.slice(0, 50)}</div>}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-500 text-xs">
                      {new Date(msg.created_at).toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
