'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface InboxContact {
  contact_phone: string
  contact_name: string | null
  customer_id: string
  customer_name: string
  last_message: string | null
  last_message_at: string
  last_inbound_at: string | null
  is_24h_open: boolean
}

interface MessageItem {
  id: string
  customer_id: string
  contact_phone: string
  direction: 'inbound' | 'outbound'
  content: string
  status: string
  created_at: string
}

interface CustomerOption {
  id: string
  name: string
}

export default function InboxPage() {
  const [contacts, setContacts] = useState<InboxContact[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [selectedContact, setSelectedContact] = useState<InboxContact | null>(null)

  const [messages, setMessages] = useState<MessageItem[]>([])
  const [replyText, setReplyText] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const chatBottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Fetch customers for filter
  useEffect(() => {
    fetch('/api/customers')
      .then(res => res.json())
      .then(d => { if (d.data) setCustomers(d.data) })
      .catch(() => {})
  }, [])

  // Fetch inbox contact list
  const fetchContacts = useCallback(async () => {
    try {
      const url = selectedCustomerId ? `/api/inbox?customer_id=${selectedCustomerId}` : '/api/inbox'
      const res = await fetch(url)
      const data = await res.json()
      if (data.data) {
        setContacts(data.data)
      }
    } catch { }
    setLoadingContacts(false)
  }, [selectedCustomerId])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  // Fetch conversation thread for selected contact
  const fetchThread = useCallback(async () => {
    if (!selectedContact) return
    setLoadingThread(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/inbox/${selectedContact.contact_phone}?customer_id=${selectedContact.customer_id}`)
      const data = await res.json()
      if (data.data) {
        setMessages(data.data)
      }
    } catch { }
    setLoadingThread(false)
  }, [selectedContact])

  useEffect(() => {
    fetchThread()
  }, [fetchThread])

  // Scroll chat thread to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Supabase Realtime Subscription for incoming / outgoing message logs
  useEffect(() => {
    const channel = supabase
      .channel('inbox-live-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_logs' },
        (payload) => {
          const newMsg = payload.new as MessageItem
          fetchContacts()
          if (selectedContact && newMsg.contact_phone === selectedContact.contact_phone) {
            setMessages((prev) => [...prev, newMsg])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedContact, fetchContacts, supabase])

  // Send direct reply from dashboard
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedContact || !replyText.trim() || sendingReply) return

    setSendingReply(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/inbox/${selectedContact.contact_phone}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedContact.customer_id,
          message: replyText.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim balasan')
      }

      setReplyText('')
      fetchThread()
      fetchContacts()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim balasan')
    } finally {
      setSendingReply(false)
    }
  }

  // Filter contacts by search query
  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase()
    return (
      (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
      c.contact_phone.includes(q) ||
      c.customer_name.toLowerCase().includes(q)
    )
  })

  // Format 24h window left time
  const getWindowTimeLeft = (lastInboundAt: string | null): string | null => {
    if (!lastInboundAt) return null
    const last = new Date(lastInboundAt).getTime()
    const now = new Date().getTime()
    const diff = 24 * 60 * 60 * 1000 - (now - last)
    if (diff <= 0) return null
    const hours = Math.floor(diff / (60 * 60 * 1000))
    const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
    return `${hours}j ${mins}m`
  }

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>💬</span> Live Conversation Inbox
            <span className="text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              Realtime WS
            </span>
          </h1>
          <p className="text-zinc-400 text-xs mt-0.5">
            Pantau dan balas pesan pelanggan secara real-time atas nama bisnis WhatsApp Anda
          </p>
        </div>

        {/* Customer Filter */}
        {customers.length > 1 && (
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
          >
            <option value="">Semua Tenant Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Main Inbox Container */}
      <div className="flex-1 min-h-0 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex shadow-2xl">
        
        {/* Left Column: Contact List */}
        <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/60 shrink-0">
          
          {/* Search Box */}
          <div className="p-3 border-b border-zinc-800">
            <input
              type="text"
              placeholder="🔍 Cari kontak atau no WA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>

          {/* Contact Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
            {loadingContacts ? (
              <div className="p-6 text-center text-zinc-500 text-xs">Memuat kontak...</div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-12 h-12 bg-zinc-800/60 text-zinc-400 rounded-2xl flex items-center justify-center text-xl mx-auto border border-zinc-700/50">
                  💬
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-300">Belum Ada Chat Masuk</h4>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                    Kirim pesan WhatsApp dari HP ke nomor bisnis Anda untuk menguji percakapan realtime.
                  </p>
                </div>
                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 text-left text-[11px] text-zinc-400 space-y-1">
                  <div className="font-semibold text-emerald-400">💡 Cara Tes:</div>
                  <div>1. Buka WA di HP Anda</div>
                  <div>2. Chat ke nomor bisnis Anda</div>
                  <div>3. Pesan akan muncul di sini!</div>
                </div>
              </div>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected =
                  selectedContact?.contact_phone === contact.contact_phone &&
                  selectedContact?.customer_id === contact.customer_id
                const windowLeft = getWindowTimeLeft(contact.last_inbound_at)

                return (
                  <button
                    key={`${contact.customer_id}_${contact.contact_phone}`}
                    onClick={() => setSelectedContact(contact)}
                    className={`w-full p-3 text-left flex items-start gap-3 transition-colors ${
                      isSelected ? 'bg-zinc-800/80 border-l-4 border-emerald-500' : 'hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 border border-zinc-700">
                      {(contact.contact_name || contact.contact_phone)[0]?.toUpperCase() || '?'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-sm truncate text-white">
                          {contact.contact_name || contact.contact_phone}
                        </span>
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          {new Date(contact.last_message_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        {contact.last_message || 'Pesan terkirim'}
                      </div>

                      <div className="flex items-center justify-between mt-1.5 text-[10px]">
                        <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md border border-zinc-700/60 truncate max-w-[140px]">
                          {contact.customer_name}
                        </span>
                        
                        {windowLeft ? (
                          <span className="text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            ✅ 24h ({windowLeft})
                          </span>
                        ) : (
                          <span className="text-amber-500 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded">
                            ⏰ Closed
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat Thread View */}
        {selectedContact ? (
          <div className="flex-1 flex flex-col min-h-0 bg-zinc-950/30">
            
            {/* Thread Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center font-bold text-sm text-white border border-zinc-700">
                  {(selectedContact.contact_name || selectedContact.contact_phone)[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <h2 className="font-semibold text-sm text-white flex items-center gap-2">
                    {selectedContact.contact_name || selectedContact.contact_phone}
                    <span className="text-xs text-zinc-400 font-mono">({selectedContact.contact_phone})</span>
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Customer: <span className="text-zinc-300 font-medium">{selectedContact.customer_name}</span>
                  </p>
                </div>
              </div>

              {/* 24h Window Badge */}
              <div className="text-xs">
                {getWindowTimeLeft(selectedContact.last_inbound_at) ? (
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-medium">
                    ✅ Jendela 24j Terbuka ({getWindowTimeLeft(selectedContact.last_inbound_at)} tersisa)
                  </span>
                ) : (
                  <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full font-medium">
                    ⏰ Jendela 24j Tertutup (Gunakan Template)
                  </span>
                )}
              </div>
            </div>

            {/* Chat Bubble Container */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {loadingThread ? (
                <div className="text-center text-zinc-500 text-sm py-8">Memuat pesan...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-zinc-500 text-xs py-8">Belum ada riwayat pesan</div>
              ) : (
                messages.map((msg) => {
                  const isInbound = msg.direction === 'inbound' || msg.status === 'received'
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl px-4 py-2.5 text-sm ${
                          isInbound
                            ? 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700/50'
                            : 'bg-emerald-600/30 text-emerald-100 rounded-tr-none border border-emerald-500/30'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] opacity-60">
                          <span>{new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                          {!isInbound && (
                            <span>
                              {msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Error Banner */}
            {errorMsg && (
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs flex items-center justify-between">
                <span>⚠️ {errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="hover:text-white">✕</button>
              </div>
            )}

            {/* Reply Input Box */}
            <form onSubmit={handleSendReply} className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex gap-2 items-center">
              <input
                type="text"
                placeholder={
                  getWindowTimeLeft(selectedContact.last_inbound_at)
                    ? 'Ketik balasan langsung...'
                    : 'Jendela 24j tertutup. Pelanggan harus membalas dulu...'
                }
                disabled={!getWindowTimeLeft(selectedContact.last_inbound_at) || sendingReply}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 disabled:opacity-50 font-sans"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || sendingReply || !getWindowTimeLeft(selectedContact.last_inbound_at)}
                className="bg-emerald-500 text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-emerald-400 transition disabled:opacity-50 shrink-0"
              >
                {sendingReply ? 'Mengirim...' : 'Kirim Balasan'}
              </button>
            </form>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-950/20">
            <div className="w-16 h-16 bg-zinc-800/80 text-zinc-300 rounded-3xl flex items-center justify-center text-3xl mb-4 border border-zinc-700 shadow-lg">
              💬
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Pilih Percakapan</h3>
            <p className="text-zinc-500 text-xs max-w-sm leading-relaxed">
              Pilih kontak dari daftar di sebelah kiri untuk melihat riwayat percakapan dan mengirim balasan secara live.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
