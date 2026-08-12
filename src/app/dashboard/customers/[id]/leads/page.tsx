'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Lead {
  id: string
  customer_id: string
  contact_phone: string
  contact_name: string | null
  package: string | null
  status: string
  data_json: string | null
  data: Record<string, string>
  source: string | null
  created_at: string
  updated_at: string
}

const STATUS_COLORS: Record<string, string> = {
  Inquiry: 'bg-blue-500/20 text-blue-400',
  Contacted: 'bg-yellow-500/20 text-yellow-400',
  Booked: 'bg-purple-500/20 text-purple-400',
  'DP Paid': 'bg-green-500/20 text-green-400',
  Completed: 'bg-emerald-500/20 text-emerald-400',
  Cancelled: 'bg-red-500/20 text-red-400',
}

export default function LeadsPage({ params }: { params: { id: string } }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${params.id}/leads`)
      const data = await res.json()
      if (data.data) setLeads(data.data)
    } catch { }
    setLoading(false)
  }, [params.id])

  const fetchCustomer = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${params.id}`)
      const data = await res.json()
      if (data.data?.name) setCustomerName(data.data.name)
    } catch { }
  }, [params.id])

  useEffect(() => { fetchLeads(); fetchCustomer() }, [fetchLeads, fetchCustomer])

  const filtered = statusFilter
    ? leads.filter(l => l.status === statusFilter)
    : leads

  const statuses = [...new Set(leads.map(l => l.status))].sort()

  const stats = {
    total: leads.length,
    inquiry: leads.filter(l => l.status === 'Inquiry').length,
    contacted: leads.filter(l => l.status === 'Contacted').length,
    booked: leads.filter(l => l.status === 'Booked' || l.status === 'DP Paid').length,
  }

  if (loading) return <div className="text-zinc-500">Loading leads...</div>

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <Link href={`/dashboard/customers/${params.id}`} className="text-zinc-400 hover:text-white text-sm mb-3 inline-block">← Back to {customerName || 'customer'}</Link>
        <h1 className="text-2xl font-bold mb-1">📊 Leads</h1>
        <p className="text-zinc-500">Semua leads yang terkumpul dari chatbot untuk {customerName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Leads', value: stats.total, color: 'text-white' },
          { label: 'Inquiry', value: stats.inquiry, color: 'text-blue-400' },
          { label: 'Contacted', value: stats.contacted, color: 'text-yellow-400' },
          { label: 'Booked/DP', value: stats.booked, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      {statuses.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setStatusFilter('')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              !statusFilter ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}>All ({leads.length})</button>
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                statusFilter === s ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}>{s} ({leads.filter(l => l.status === s).length})</button>
          ))}
        </div>
      )}

      {/* Leads list */}
      {filtered.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl py-12 text-center text-zinc-500">
          {leads.length === 0
            ? 'Belum ada leads. Mulai dengan menghubungkan WhatsApp dan menjalankan chatbot.'
            : 'Tidak ada leads dengan filter ini.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(lead => (
            <div key={lead.id} className="bg-zinc-900 rounded-xl overflow-hidden">
              {/* Main row */}
              <button onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-zinc-800/50 transition">
                <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-lg shrink-0">
                  {(lead.data?.name || lead.contact_name || '👤')[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{lead.data?.name || lead.contact_name || 'Anonymous'}</span>
                    {lead.package && (
                      <span className="bg-zinc-800 text-zinc-400 text-xs px-2 py-0.5 rounded-full">{lead.package}</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    📱 {lead.contact_phone} • 🕐 {new Date(lead.created_at).toLocaleString('id-ID')}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status] || 'bg-zinc-800 text-zinc-400'}`}>
                  {lead.status}
                </span>
                <svg className={`w-4 h-4 text-zinc-500 transition-transform ${expandedId === lead.id ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
              </button>

              {/* Expanded detail */}
              {expandedId === lead.id && (
                <div className="px-5 pb-4 border-t border-zinc-800">
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {Object.entries(lead.data || {}).map(([k, v]) => (
                      <div key={k} className="bg-zinc-800 rounded-lg px-3 py-2">
                        <div className="text-xs text-zinc-500">{k}</div>
                        <div className="text-sm font-medium">{v || '-'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-xs text-zinc-600">
                    <span>Source: {lead.source || 'whatsapp_bot'}</span>
                    <span>•</span>
                    <span>Updated: {new Date(lead.updated_at).toLocaleString('id-ID')}</span>
                    <span>•</span>
                    <span className="font-mono text-zinc-700">{lead.id}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Export hint */}
      {leads.length > 0 && (
        <div className="text-center text-xs text-zinc-600 mt-6">
          Data tersimpan otomatis saat chatbot mengumpulkan lead.
        </div>
      )}
    </div>
  )
}
