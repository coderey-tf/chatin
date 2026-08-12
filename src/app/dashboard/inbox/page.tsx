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
    if (!selectedContact) return

    const channel = supabase
      .channel(`inbox-${selectedContact.customer_id}-${selectedContact.contact_phone}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_logs',
          filter: `customer_id=eq.${selectedContact.customer_id}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageItem
          if (newMsg.contact_phone === selectedContact.contact_phone) {
            setMessages((prev) => {
              if (prev.some(m => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
          }
          // Refresh contact list summary
          fetchContacts()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedContact, supabase, fetchContacts])

  // Handle send reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedContact || !replyText.trim() || sendingReply) return

    setSendingReply(true)
    setErrorMsg(null)

    const textToSend = replyText.trim()
    setReplyText('')

    try {
      const res = await fetch(`/api/inbox/${selectedContact.contact_phone}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedContact.customer_id,
          message: textToSend,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mengirim pesan')
        setReplyText(textToSend)
      } else {
        // Optimistic append or re-fetch
        fetchThread()
        fetchContacts()
      }
    } catch {
      setErrorMsg('Terjadi kesalahan koneksi.')
      setReplyText(textToSend)
    }
    setSendingReply(false)
  }

  const filteredContacts = contacts.filter(c => {
    const name = (c.contact_name || '').toLowerCase()
    const phone = c.contact_phone.toLowerCase()
    const cust = c.customer_name.toLowerCase()
    const q = searchQuery.toLowerCase()
    return name.includes(q) || phone.includes(q) || cust.includes(q)
  })

  // Calculate 24h window remaining time
  const getWindowTimeLeft = (lastInboundStr: string | null) => {
    if (!lastInboundStr) return null
    const diff = new Date(lastInboundStr).getTime() + (24 * 60 * 60 * 1000) - Date.now()
    if (diff <= 0) return null
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}j ${mins}m`
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>💬</span> Live Conversation Inbox
          </h1>
          <p className="text-zinc-400 text-xs mt-0.5">
            Pantau dan balas pesan pelanggan secara real-time atas nama customer Anda
          </p>
        </div>

        {/* Customer Filter */}
        {customers.length > 0 && (
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-sm rounded-xl px-3 py-2 text-white focus:outline-none"
          >
            <option value="">Semua Customers</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Main 2-Column Chat Layout */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col md:flex-row min-h-0">
        
        {/* Left Column: Contact Sidebar */}
        <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-zinc-800 flex flex-col shrink-0 bg-zinc-900/60">
          <div className="p-3 border-b border-zinc-800">
            <input
              type="text"
              placeholder="🔍 Cari kontak atau no WA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
            {loadingContacts ? (
              <div className="p-8 text-center text-zinc-500 text-sm">Loading percakapan...</div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">
                {contacts.length === 0 ? 'Belum ada pesan masuk' : 'Tidak ada kontak yang cocok'}
              </div>
            ) : (
              filteredContacts.map(contact => {
                const isSelected = selectedContact?.contact_phone === contact.contact_phone && selectedContact?.customer_id === contact.customer_id
                const windowLeft = getWindowTimeLeft(contact.last_inbound_at)

                return (
                  <button
                    key={`${contact.customer_id}_${contact.contact_phone}`}
                    onClick={() => setSelectedContact(contact)}
                    className={`w-full p-3.5 text-left transition flex items-start gap-3 hover:bg-zinc-800/40 ${
                      isSelected ? 'bg-zinc-800/80' : ''
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
                          <span className="text-green-400 font-medium bg-green-500/10 px-1.5 py-0.5 rounded">
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
                  <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full font-medium">
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
                            : 'bg-green-700/40 text-emerald-100 rounded-tr-none border border-green-600/40'
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
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30 text-red-400 text-xs flex justify-between items-center">
                <span>⚠️ {errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">✕</button>
              </div>
            )}

            {/* Reply Input Box */}
            <form onSubmit={handleSendReply} className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex gap-2">
              <input
                type="text"
                placeholder={
                  !getWindowTimeLeft(selectedContact.last_inbound_at) && selectedContact.last_inbound_at
                    ? '⚠️ Jendela 24j tertutup. Pelanggan belum membalas...'
                    : 'Ketik balasan Anda di sini...'
                }
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={sendingReply}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                className="bg-white text-zinc-900 font-semibold px-5 py-2.5 rounded-xl hover:bg-zinc-100 transition disabled:opacity-50 text-sm flex items-center gap-1.5 shrink-0"
              >
                {sendingReply ? 'Kirim...' : 'Kirim 📤'}
              </button>
            </form>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
            <div className="text-5xl mb-4">💬</div>
            <h3 className="text-lg font-medium text-zinc-300 mb-1">Pilih Percakapan</h3>
            <p className="text-xs text-zinc-500 max-w-sm">
              Pilih kontak dari daftar di sebelah kiri untuk melihat riwayat percakapan dan mengirim balasan secara live.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
