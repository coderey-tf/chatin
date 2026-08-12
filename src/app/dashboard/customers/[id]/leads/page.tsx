'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'

interface Lead {
  id: string
  customer_id: string
  contact_phone: string
  contact_name: string | null
  package: string | null
  status: string
  data_json: string | object | null
  data: Record<string, string>
  source: string | null
  created_at: string
  updated_at: string
}

const ALL_STATUSES = ['Inquiry', 'Contacted', 'Booked', 'DP Paid', 'Completed', 'Cancelled']

const STATUS_COLORS: Record<string, string> = {
  Inquiry: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Contacted: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Booked: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'DP Paid': 'bg-green-500/20 text-green-400 border-green-500/30',
  Completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export default function LeadsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}/leads`)
      const data = await res.json()
      if (data.data) setLeads(data.data)
    } catch { }
    setLoading(false)
  }, [id])

  const fetchCustomer = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}`)
      const data = await res.json()
      if (data.data?.name) setCustomerName(data.data.name)
    } catch { }
  }, [id])

  useEffect(() => {
    fetchLeads()
    fetchCustomer()
  }, [fetchLeads, fetchCustomer])

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))
    try {
      await fetch(`/api/customers/${id}/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch {
      fetchLeads()
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus lead ini?')) return
    setLeads(prev => prev.filter(l => l.id !== leadId))
    try {
      await fetch(`/api/customers/${id}/leads/${leadId}`, {
        method: 'DELETE',
      })
    } catch {
      fetchLeads()
    }
  }

  const handleExportCSV = () => {
    if (leads.length === 0) return

    // Extract all unique data keys
    const customKeys = new Set<string>()
    leads.forEach(l => {
      Object.keys(l.data || {}).forEach(k => customKeys.add(k))
    })
    const customKeysArr = Array.from(customKeys)

    const headers = ['ID', 'Nama', 'No. WhatsApp', 'Paket', 'Status', 'Sumber', 'Tanggal Dibuat', ...customKeysArr]
    const rows = leads.map(l => [
      l.id,
      `"${(l.data?.name || l.contact_name || '').replace(/"/g, '""')}"`,
      `"${l.contact_phone}"`,
      `"${(l.package || '').replace(/"/g, '""')}"`,
      l.status,
      l.source || 'whatsapp_bot',
      new Date(l.created_at).toLocaleString('id-ID'),
      ...customKeysArr.map(k => `"${(l.data?.[k] || '').replace(/"/g, '""')}"`)
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `leads_${customerName || id}_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filtered = leads.filter(l => {
    const matchesStatus = statusFilter ? l.status === statusFilter : true
    const name = (l.data?.name || l.contact_name || '').toLowerCase()
    const phone = l.contact_phone.toLowerCase()
    const query = searchQuery.toLowerCase()
    const matchesSearch = name.includes(query) || phone.includes(query)
    return matchesStatus && matchesSearch
  })

  const stats = {
    total: leads.length,
    inquiry: leads.filter(l => l.status === 'Inquiry').length,
    contacted: leads.filter(l => l.status === 'Contacted').length,
    booked: leads.filter(l => l.status === 'Booked' || l.status === 'DP Paid').length,
  }

  if (loading) return <div className="text-zinc-500 p-4">Loading leads...</div>

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <Link href={`/dashboard/customers/${id}`} className="text-zinc-400 hover:text-white text-sm mb-2 inline-block">
            ← Kembali ke {customerName || 'Customer'}
          </Link>
          <h1 className="text-2xl font-bold mb-1">📊 Leads ({leads.length})</h1>
          <p className="text-zinc-400 text-sm">Semua leads yang terkumpul dari chatbot untuk {customerName}</p>
        </div>

        {leads.length > 0 && (
          <button
            onClick={handleExportCSV}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm px-4 py-2.5 rounded-xl border border-zinc-700 transition flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            📥 Export CSV
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Leads', value: stats.total, color: 'text-white' },
          { label: 'Inquiry', value: stats.inquiry, color: 'text-blue-400' },
          { label: 'Contacted', value: stats.contacted, color: 'text-yellow-400' },
          { label: 'Booked / DP', value: stats.booked, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls: Search & Status Filters */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="🔍 Cari berdasarkan nama atau no WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              !statusFilter ? 'bg-white text-zinc-900 font-semibold' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
            }`}
          >
            Semua ({leads.length})
          </button>
          {ALL_STATUSES.map(s => {
            const count = leads.filter(l => l.status === s).length
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  statusFilter === s ? 'bg-white text-zinc-900 font-semibold' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                }`}
              >
                {s} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Leads list */}
      {filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center text-zinc-500">
          {leads.length === 0
            ? 'Belum ada leads. Mulai dengan menghubungkan WhatsApp dan menjalankan chatbot.'
            : 'Tidak ada leads yang sesuai dengan pencarian/filter.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(lead => (
            <div key={lead.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Main row */}
              <div className="w-full flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4 text-left">
                <div className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}>
                  <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-lg shrink-0 border border-zinc-700">
                    {(lead.data?.name || lead.contact_name || '👤')[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-white">{lead.data?.name || lead.contact_name || 'Anonymous'}</span>
                      {lead.package && (
                        <span className="bg-zinc-800 text-zinc-400 text-xs px-2.5 py-0.5 rounded-full border border-zinc-700">{lead.package}</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      📱 {lead.contact_phone} • 🕐 {new Date(lead.created_at).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>

                {/* Status Dropdown */}
                <div className="flex items-center gap-3 self-end sm:self-center">
                  <select
                    value={lead.status}
                    onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border focus:outline-none cursor-pointer ${
                      STATUS_COLORS[lead.status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {ALL_STATUSES.map(st => (
                      <option key={st} value={st} className="bg-zinc-900 text-white">{st}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleDeleteLead(lead.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition"
                    title="Hapus lead"
                  >
                    🗑️
                  </button>

                  <button
                    onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition"
                  >
                    <svg className={`w-4 h-4 transition-transform ${expandedId === lead.id ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === lead.id && (
                <div className="px-5 pb-4 border-t border-zinc-800 bg-zinc-950/40">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                    {Object.entries(lead.data || {}).map(([k, v]) => (
                      <div key={k} className="bg-zinc-800/60 border border-zinc-800 rounded-xl px-3.5 py-2.5">
                        <div className="text-xs text-zinc-500 capitalize">{k.replace(/_/g, ' ')}</div>
                        <div className="text-sm font-medium text-zinc-200 mt-0.5">{v || '-'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-4 text-xs text-zinc-500 flex-wrap">
                    <span>Sumber: {lead.source || 'whatsapp_bot'}</span>
                    <span>•</span>
                    <span>Diubah: {new Date(lead.updated_at).toLocaleString('id-ID')}</span>
                    <span>•</span>
                    <span className="font-mono text-zinc-600">ID: {lead.id}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
