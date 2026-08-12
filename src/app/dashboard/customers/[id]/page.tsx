'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface CustomerDetail {
  id: string
  name: string
  email: string | null
  status: string
  metadata: object | null
  phone_number_id: string | null
  phone_number: string | null
  wa_account_status: string | null
  onboarded_at: string | null
  created_at: string
  updated_at: string
  whatsapp_accounts?: Array<{
    phone_number_id: string
    phone_number: string
    status: string
    name?: string
  }>
}

interface SetupLink {
  id: string
  status: string
  setup_url?: string
  token_last4?: string
  expires_at?: string
  created_at: string
  consumed_at?: string
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [links, setLinks] = useState<SetupLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [lastSetupUrl, setLastSetupUrl] = useState<string | null>(null)

  // Send message test
  const [sendTo, setSendTo] = useState('')
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)

  useEffect(() => {
    fetchCustomer()
    fetchLinks()
  }, [])

  const fetchCustomer = async () => {
    try {
      const res = await fetch(`/api/customers/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch')
      setCustomer(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer')
    } finally {
      setLoading(false)
    }
  }

  const fetchLinks = async () => {
    try {
      const res = await fetch(`/api/customers/${id}/setup-link`)
      if (res.ok) {
        const data = await res.json()
        setLinks(Array.isArray(data.data) ? data.data : (data.data?.data || []))
      }
    } catch {
      // Ignore
    }
  }

  const generateSetupLink = async () => {
    setGeneratingLink(true)
    try {
      const res = await fetch(`/api/customers/${id}/setup-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_in_hours: 168 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate link')
      setLastSetupUrl(data.data.setup_url)
      fetchLinks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setGeneratingLink(false)
    }
  }

  const archiveCustomer = async () => {
    if (!confirm(`Archive customer ${customer?.name}?`)) return
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to archive')
      router.push('/dashboard/customers')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive')
    }
  }

  const sendMessage = async () => {
    if (!sendTo || !sendText) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: id,
          to: sendTo,
          type: 'text',
          text: { body: sendText },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setSendResult(`✅ Sent: ${data.data?.data?.id || 'OK'}`)
      setSendTo('')
      setSendText('')
    } catch (err) {
      setSendResult(`❌ ${err instanceof Error ? err.message : 'Failed to send'}`)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="text-zinc-500">Loading...</div>
  }

  if (error || !customer) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error || 'Customer not found'}</p>
        <Link href="/dashboard/customers" className="text-white hover:underline">
          Back to customers
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <Link
          href="/dashboard/customers"
          className="text-zinc-400 hover:text-white text-sm mb-4 inline-block"
        >
          ← Back
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">{customer.name}</h1>
            <p className="text-zinc-400">{customer.email || 'No email'} • {customer.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/customers/${id}/bot`}
              className="text-sm bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg hover:bg-blue-500/30 transition">🤖 Bot Settings</Link>
            <Link href={`/dashboard/customers/${id}/leads`}
              className="text-sm bg-purple-500/20 text-purple-400 px-3 py-1.5 rounded-lg hover:bg-purple-500/30 transition">📊 Leads</Link>
          </div>
        </div>
      </div>

      {/* WhatsApp status */}
      <div className="bg-zinc-900 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">WhatsApp Connection</h2>
        {customer.phone_number_id ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Phone Number</span>
              <span>{customer.phone_number || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Phone Number ID</span>
              <span className="font-mono text-xs">{customer.phone_number_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Status</span>
              <span>{customer.wa_account_status || 'connected'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Onboarded</span>
              <span>{customer.onboarded_at ? new Date(customer.onboarded_at).toLocaleString() : '-'}</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-zinc-500 mb-4">Belum terhubung ke WhatsApp</p>
            <button
              onClick={generateSetupLink}
              disabled={generatingLink}
              className="bg-white text-zinc-900 px-4 py-2 rounded-lg font-semibold hover:bg-zinc-100 transition disabled:opacity-50"
            >
              {generatingLink ? 'Generating...' : 'Generate Setup Link'}
            </button>
          </div>
        )}
      </div>

      {/* Setup Links */}
      <div className="bg-zinc-900 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Setup Links</h2>
          <button
            onClick={generateSetupLink}
            disabled={generatingLink}
            className="text-sm bg-zinc-800 text-white px-3 py-1 rounded-lg hover:bg-zinc-700 transition disabled:opacity-50"
          >
            {generatingLink ? '...' : '+ New Link'}
          </button>
        </div>

        {lastSetupUrl && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
            <div className="text-sm text-green-400 mb-2">✅ Setup link generated (copy now - shown once):</div>
            <div className="flex gap-2">
              <input
                value={lastSetupUrl}
                readOnly
                className="flex-1 bg-zinc-800 rounded px-3 py-2 text-xs font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(lastSetupUrl)
                  alert('Copied!')
                }}
                className="bg-green-500 text-white px-3 py-2 rounded text-sm"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {links.length === 0 ? (
          <p className="text-sm text-zinc-500">No setup links yet</p>
        ) : (
          <div className="space-y-2">
            {links.map((link) => (
              <div key={link.id} className="flex items-center justify-between bg-zinc-800 rounded-lg p-3 text-sm">
                <div>
                  <div className="font-mono text-xs">{link.id}</div>
                  <div className="text-zinc-500 text-xs">
                    {link.status} • {link.token_last4 ? `...${link.token_last4}` : ''} • Created: {new Date(link.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  link.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  link.status === 'consumed' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-zinc-500/20 text-zinc-400'
                }`}>
                  {link.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send test message */}
      {customer.phone_number_id && (
        <div className="bg-zinc-900 rounded-xl p-6 mb-6">
          <h2 className="font-semibold mb-4">Send Test Message</h2>
          <div className="space-y-4">
            <input
              type="text"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="To: +628xxxxx"
              className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600"
            />
            <textarea
              value={sendText}
              onChange={(e) => setSendText(e.target.value)}
              placeholder="Message body..."
              rows={3}
              className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !sendTo || !sendText}
              className="w-full bg-white text-zinc-900 rounded-xl py-3 font-semibold hover:bg-zinc-100 transition disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Message'}
            </button>
            {sendResult && (
              <div className="text-sm p-3 rounded-lg bg-zinc-800">
                {sendResult}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
        <h2 className="font-semibold text-red-400 mb-4">Danger Zone</h2>
        <button
          onClick={archiveCustomer}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition"
        >
          Archive Customer
        </button>
      </div>
    </div>
  )
}
