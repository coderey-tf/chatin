'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { useToast } from '@/components/Toast'

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

interface LeadData {
  id: string
  contact_phone: string
  contact_name: string | null
  package: string | null
  status: string
  data_json: Record<string, string> | string | null
  source: string | null
  last_inbound_at: string | null
  created_at: string
}

export default function InboxPage() {
  const [contacts, setContacts] = useState<InboxContact[]>([])
  const [selectedContact, setSelectedContact] = useState<InboxContact | null>(null)
  const [activeLead, setActiveLead] = useState<LeadData | null>(null)

  const [messages, setMessages] = useState<MessageItem[]>([])
  const [replyText, setReplyText] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [showRightPanel, setShowRightPanel] = useState<boolean>(false)

  const toast = useToast()
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Fetch inbox contact list
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/inbox')
      const data = await res.json()
      if (data.data) {
        setContacts(data.data)
      }
    } catch { }
    setLoadingContacts(false)
  }, [])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  // Fetch conversation thread & lead data for selected contact
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
      if (data.lead) {
        setActiveLead(data.lead)
      } else {
        setActiveLead(null)
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
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'message_logs' },
        (payload) => {
          const updatedMsg = payload.new as MessageItem
          if (selectedContact && updatedMsg.contact_phone === selectedContact.contact_phone) {
            setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? { ...m, status: updatedMsg.status } : m))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedContact, fetchContacts, supabase])

  // Send direct reply from dashboard
  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
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
      toast.success('Pesan balasan berhasil terkirim via WhatsApp API')
      fetchThread()
      fetchContacts()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirim balasan'
      setErrorMsg(msg)
      toast.error(msg)
    } finally {
      setSendingReply(false)
    }
  }

  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // Reset / Delete active lead to test bot flow again
  const confirmDeleteActiveLead = async () => {
    if (!activeLead || !selectedContact) return
    setResetLoading(true)

    try {
      await fetch(`/api/customers/${selectedContact.customer_id}/leads/${activeLead.id}`, {
        method: 'DELETE',
      })
      setActiveLead(null)
      setConfirmResetOpen(false)
      toast.success(`Data lead ${selectedContact.contact_phone} berhasil di-reset untuk tes ulang`)
      fetchThread()
    } catch {
      setErrorMsg('Gagal menghapus lead')
      toast.error('Gagal mereset data lead')
    } finally {
      setResetLoading(false)
    }
  }

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

  // Filter contacts by search query & status filter
  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
      c.contact_phone.includes(q)

    const isOpen = Boolean(getWindowTimeLeft(c.last_inbound_at))
    if (statusFilter === 'open') return matchesSearch && isOpen
    if (statusFilter === 'closed') return matchesSearch && !isOpen
    return matchesSearch
  })

  // Render WhatsApp Markdown (*bold*, _italic_, etc.)
  const renderWhatsAppText = (text: string) => {
    if (!text) return ''
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|_.*?_|~.*?~)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <strong key={i} className="font-bold text-white">{part.slice(1, -1)}</strong>
      }
      if (part.startsWith('_') && part.endsWith('_')) {
        return <em key={i} className="italic text-zinc-200">{part.slice(1, -1)}</em>
      }
      if (part.startsWith('~') && part.endsWith('~')) {
        return <del key={i} className="line-through opacity-70">{part.slice(1, -1)}</del>
      }
      return part
    })
  }

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col space-y-3 max-w-full overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>💬</span> Live Conversation Inbox
            <span className="text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              Realtime WS
            </span>
          </h1>
          <p className="text-zinc-400 text-xs mt-0.5">
            Pantau dan balas pesan pelanggan secara real-time atas nama bisnis WhatsApp Anda
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 min-h-0 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex shadow-2xl relative">
        
        {/* COLUMN 1: Left Contact List & Filters */}
        <div className={`w-full md:w-64 lg:w-72 border-r border-zinc-800 flex flex-col bg-zinc-900/80 shrink-0 ${selectedContact ? 'hidden md:flex' : 'flex'}`}>
          
          {/* Search & Status Filters */}
          <div className="p-3 border-b border-zinc-800 space-y-2">
            <input
              type="text"
              placeholder="🔍 Cari percakapan, kontak..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-sans"
            />

            <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[11px] font-medium gap-1">
              <button
                onClick={() => setStatusFilter('all')}
                className={`flex-1 py-1 rounded-lg transition text-center ${statusFilter === 'all' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Semua ({contacts.length})
              </button>
              <button
                onClick={() => setStatusFilter('open')}
                className={`flex-1 py-1 rounded-lg transition text-center ${statusFilter === 'open' ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Terbuka
              </button>
              <button
                onClick={() => setStatusFilter('closed')}
                className={`flex-1 py-1 rounded-lg transition text-center ${statusFilter === 'closed' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Closed
              </button>
            </div>
          </div>

          {/* Contact Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
            {loadingContacts ? (
              <div className="p-6 text-center text-zinc-500 text-xs">Memuat percakapan...</div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <div className="w-10 h-10 bg-zinc-800/60 text-zinc-400 rounded-2xl flex items-center justify-center text-lg mx-auto border border-zinc-700/50">
                  💬
                </div>
                <h4 className="text-xs font-bold text-zinc-300">Tidak Ada Percakapan</h4>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Kirim pesan WhatsApp ke nomor bisnis Anda untuk memulai percakapan.
                </p>
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
                    className={`w-full p-3 text-left flex items-start gap-2.5 transition-colors ${
                      isSelected ? 'bg-zinc-800/90 border-l-4 border-emerald-500' : 'hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="w-9 h-9 bg-emerald-600/30 text-emerald-300 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-500/30 shadow">
                      {(contact.contact_name || contact.contact_phone)[0]?.toUpperCase() || '?'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs truncate text-white">
                          {contact.contact_name || contact.contact_phone}
                        </span>
                        <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                          {new Date(contact.last_message_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {contact.last_message || 'Pesan terkirim'}
                      </div>

                      <div className="flex items-center justify-end mt-1 text-[10px]">
                        {windowLeft ? (
                          <span className="text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                            ● Terbuka ({windowLeft})
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
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

        {/* COLUMN 2: Middle Active Chat Thread */}
        {selectedContact ? (
          <div className={`flex-1 flex flex-col min-w-0 min-h-0 bg-[#0b141a] ${!selectedContact ? 'hidden md:flex' : 'flex'}`}>
            
            {/* Thread Header (Clean Responsive Design) */}
            <div className="p-3 border-b border-zinc-800 bg-[#202c33] shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  onClick={() => setSelectedContact(null)}
                  className="md:hidden p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs shrink-0"
                  title="Kembali"
                >
                  ←
                </button>

                <div className="w-9 h-9 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-xs border border-emerald-400/40 shrink-0 shadow">
                  {(selectedContact.contact_name || selectedContact.contact_phone)[0]?.toUpperCase() || '?'}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-bold text-xs sm:text-sm text-white truncate leading-tight">
                      {selectedContact.contact_name || selectedContact.contact_phone}
                    </h2>
                    {selectedContact.contact_name && selectedContact.contact_name !== selectedContact.contact_phone && (
                      <span className="text-xs text-zinc-400 font-mono hidden lg:inline shrink-0">
                        ({selectedContact.contact_phone})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] sm:text-[11px] mt-0.5">
                    {getWindowTimeLeft(selectedContact.last_inbound_at) ? (
                      <span className="text-emerald-400 font-semibold truncate">
                        ✅ 24j Terbuka ({getWindowTimeLeft(selectedContact.last_inbound_at)})
                      </span>
                    ) : (
                      <span className="text-amber-400 font-semibold truncate">
                        ⏰ Jendela 24j Closed
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Toggle Detail Panel Button */}
              <button
                onClick={() => setShowRightPanel(p => !p)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1 shrink-0 ${
                  showRightPanel ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                }`}
                title="Detail Pelanggan & Lead"
              >
                <span>👤</span>
                <span className="hidden sm:inline">{showRightPanel ? 'Tutup' : 'Detail'}</span>
              </button>
            </div>

            {/* WhatsApp Canvas Chat Thread */}
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px]">
              {loadingThread ? (
                <div className="text-center text-zinc-400 text-xs py-8">Memuat riwayat percakapan...</div>
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
                        className={`max-w-[85%] sm:max-w-md rounded-2xl px-3.5 py-2 text-xs shadow-md whitespace-pre-wrap leading-relaxed break-words overflow-hidden ${
                          isInbound
                            ? 'bg-[#202c33] text-zinc-100 rounded-tl-none border border-zinc-700/40'
                            : 'bg-[#005c4b] text-zinc-100 rounded-tr-none border border-emerald-500/30'
                        }`}
                      >
                        <div className="break-words">{renderWhatsAppText(msg.content)}</div>
                        <div
                          className={`text-[10px] text-right mt-1.5 flex items-center justify-end gap-1 ${
                            isInbound ? 'text-zinc-400' : 'text-emerald-200/80'
                          }`}
                        >
                          <span>{new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                          {!isInbound && (
                            <span className="text-emerald-300 font-bold">
                              {msg.status === 'delivered' || msg.status === 'read' ? '✓✓' : '✓'}
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
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs flex items-center justify-between shrink-0">
                <span>⚠️ {errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="hover:text-white">✕</button>
              </div>
            )}

            {/* Reply Bar */}
            <form onSubmit={handleSendReply} className="p-2.5 sm:p-3 border-t border-[#222d34] bg-[#202c33] flex items-center gap-2 shrink-0">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendReply()
                  }
                }}
                rows={1}
                placeholder={
                  getWindowTimeLeft(selectedContact.last_inbound_at)
                    ? 'Ketik balasan langsung (Enter untuk kirim, Shift+Enter untuk baris baru)...'
                    : 'Jendela 24j tertutup. Pelanggan harus membalas dulu...'
                }
                disabled={!getWindowTimeLeft(selectedContact.last_inbound_at) || sendingReply}
                className="flex-1 bg-[#111b21] border border-zinc-700/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50 font-sans resize-none max-h-24 leading-relaxed"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || sendingReply || !getWindowTimeLeft(selectedContact.last_inbound_at)}
                className="bg-emerald-500 text-zinc-950 font-bold px-3.5 py-2 rounded-xl text-xs hover:bg-emerald-400 transition disabled:opacity-40 shrink-0 shadow flex items-center gap-1"
              >
                <span>{sendingReply ? 'Mengirim...' : 'Kirim'}</span>
                <span>🚀</span>
              </button>
            </form>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0b141a] hidden md:flex">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-3xl flex items-center justify-center text-3xl mb-4 shadow-lg">
              💬
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Pilih Percakapan</h3>
            <p className="text-zinc-400 text-xs max-w-sm leading-relaxed">
              Pilih kontak dari daftar di sebelah kiri untuk melihat riwayat percakapan realtime dan mengirim balasan via WhatsApp KirimDev API.
            </p>
          </div>
        )}

        {/* COLUMN 3: Right Customer & Lead Detail Sidebar (Responsive Drawer on < xl, Static on >= xl) */}
        {selectedContact && showRightPanel && (
          <div className="w-80 max-w-[85vw] border-l border-zinc-800 bg-[#111b21] flex flex-col shrink-0 overflow-y-auto absolute right-0 top-0 bottom-0 z-30 shadow-2xl xl:static">
            {/* Panel Header */}
            <div className="p-3.5 border-b border-zinc-800 text-xs font-bold text-white flex items-center justify-between bg-[#202c33]">
              <span>👤 Pelanggan & Lead Info</span>
              <button onClick={() => setShowRightPanel(false)} className="text-zinc-400 hover:text-white p-1">✕</button>
            </div>

            {/* Profile Avatar Card */}
            <div className="p-4 text-center border-b border-zinc-800 space-y-2 bg-zinc-900/40">
              <div className="w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-400 text-zinc-950 font-black text-lg rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20 border-2 border-emerald-400/40">
                {(selectedContact.contact_name || selectedContact.contact_phone)[0]?.toUpperCase() || 'P'}
              </div>
              <div>
                <h3 className="font-bold text-white text-sm leading-tight truncate px-2">
                  {selectedContact.contact_name || 'Pelanggan WhatsApp'}
                </h3>
                <p className="text-xs font-mono text-emerald-400 mt-0.5">{selectedContact.contact_phone}</p>
              </div>

              <div className="pt-1 flex justify-center">
                <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                  Status: {activeLead?.status || 'Inquiry'}
                </span>
              </div>
            </div>

            {/* Extracted Lead Data */}
            <div className="p-3.5 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span>📊</span> Data Form Lead Terkumpul
                </h4>

                {activeLead ? (
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 space-y-2 text-xs">
                    {activeLead.package && (
                      <div className="pb-2 border-b border-zinc-800 flex justify-between items-center gap-2">
                        <span className="text-zinc-400 shrink-0">Paket Rekomendasi:</span>
                        <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 truncate">{activeLead.package}</span>
                      </div>
                    )}

                    {(() => {
                      const dataObj = typeof activeLead.data_json === 'object' && activeLead.data_json !== null
                        ? activeLead.data_json as Record<string, string>
                        : (() => { try { return JSON.parse(activeLead.data_json as string || '{}') } catch { return {} } })()

                      const entries = Object.entries(dataObj).filter(([k]) => !k.startsWith('_'))
                      if (entries.length === 0) {
                        return <div className="text-zinc-500 italic text-[11px]">Belum ada data pertanyaan terisi</div>
                      }

                      return entries.map(([key, val]) => (
                        <div key={key} className="flex justify-between items-center text-xs gap-2">
                          <span className="text-zinc-400 capitalize font-medium shrink-0">{key.replace(/_/g, ' ')}:</span>
                          <span className="font-semibold text-white bg-zinc-800/80 px-2 py-0.5 rounded text-[11px] border border-zinc-700/60 truncate max-w-[130px]">
                            {String(val || '')}
                          </span>
                        </div>
                      ))
                    })()}
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-zinc-800 rounded-xl text-center text-xs text-zinc-500">
                    Belum ada record data lead terkumpul.
                  </div>
                )}
              </div>

              {/* Direct Link to Leads Page & Reset Lead Button */}
              <div className="pt-1 space-y-2">
                <Link
                  href="/dashboard/leads"
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2 rounded-xl text-xs transition border border-zinc-700 text-center block"
                >
                  📊 Kelola di Data Leads
                </Link>

                {activeLead && (
                  <button
                    onClick={() => setConfirmResetOpen(true)}
                    className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold py-2 rounded-xl text-xs transition border border-red-500/20 text-center block"
                  >
                    🗑️ Reset Lead (Tes Ulang Bot)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Confirm Reset Lead Modal */}
      <ConfirmModal
        isOpen={confirmResetOpen}
        title="Reset Data Lead Pelanggan?"
        message={`Apakah Anda yakin ingin mereset data lead untuk nomor ${selectedContact?.contact_phone}? Bot WhatsApp akan dapat memproses pertanyaan & form lead dari awal lagi.`}
        confirmText="Ya, Reset Data"
        cancelText="Batal"
        variant="danger"
        loading={resetLoading}
        onConfirm={confirmDeleteActiveLead}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  )
}
