'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface SubscriptionData {
  id: string
  customer_id: string
  plan_tier: string
  status: string
  current_period_start: string
  current_period_end: string
  max_waba_accounts: number
  max_leads_per_month: number
}

interface InvoiceData {
  id: string
  plan_tier: string
  amount: number
  status: string
  payment_method: string | null
  paid_at: string | null
  created_at: string
}

interface CustomerOption {
  id: string
  name: string
}

const PLANS = [
  {
    key: 'starter',
    name: 'Starter Plan',
    price: 'Rp 75.000',
    period: '/ bulan',
    color: 'border-zinc-800 bg-zinc-900',
    btnColor: 'bg-white text-zinc-900 hover:bg-zinc-100',
    badge: 'Cocok untuk UMKM',
    features: [
      '1 WhatsApp Business Account (WABA)',
      'Hingga 500 Leads / bulan',
      'Generic Chatbot Engine',
      '5 Industry Presets',
      'Dashboard & Lead Export CSV',
      'Meta Cloud API fees pass-through',
    ],
  },
  {
    key: 'pro',
    name: 'Pro Plan',
    price: 'Rp 149.000',
    period: '/ bulan',
    color: 'border-green-500/40 bg-zinc-900 shadow-xl shadow-green-950/20',
    btnColor: 'bg-green-500 text-zinc-950 hover:bg-green-400 font-bold',
    badge: 'Popular • Best Value',
    features: [
      '3 WhatsApp Business Accounts (WABA)',
      'Hingga 3.000 Leads / bulan',
      'Live Conversation Inbox (Realtime)',
      '24h Customer Service Window Indicator',
      'Mark as Read (Centang Biru)',
      'Priority Customer Support',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise Plan',
    price: 'Rp 249.000',
    period: '/ bulan',
    color: 'border-purple-500/40 bg-zinc-900',
    btnColor: 'bg-purple-600 text-white hover:bg-purple-500',
    badge: 'Multi-brand & Agency',
    features: [
      '10 WhatsApp Business Accounts (WABA)',
      'Unlimited Leads per bulan',
      'Full Live Conversation Inbox',
      'Custom Bot Fields & Handover Rules',
      'Dedicated SLA & Setup Guidance',
      'Multi-tenant Admin Management',
    ],
  },
]

export default function BillingPage() {
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [invoices, setInvoices] = useState<InvoiceData[]>([])
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [processingPlan, setProcessingPlan] = useState<string | null>(null)

  // Fetch customers
  useEffect(() => {
    fetch('/api/customers')
      .then(res => res.json())
      .then(d => {
        if (d.data && d.data.length > 0) {
          setCustomers(d.data)
          setSelectedCustomerId(d.data[0].id)
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [])

  // Fetch billing data for selected customer
  const fetchBilling = useCallback(async () => {
    if (!selectedCustomerId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/billing?customer_id=${selectedCustomerId}`)
      const d = await res.json()
      if (d.data) {
        setSubscription(d.data.subscription)
        setInvoices(d.data.invoices || [])
      }
    } catch { }
    setLoading(false)
  }, [selectedCustomerId])

  useEffect(() => {
    fetchBilling()
  }, [fetchBilling])

  // Handle plan checkout / activation
  const handleSelectPlan = async (planKey: string, isAdminActivate = false) => {
    if (!selectedCustomerId) return
    setProcessingPlan(planKey)
    setActionMsg(null)

    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          plan_tier: planKey,
          action: isAdminActivate ? 'admin_activate' : 'create_invoice',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memproses paket')

      if (isAdminActivate) {
        setActionMsg(`✅ Status langganan berhasil diaktifkan ke ${planKey.toUpperCase()}!`)
        fetchBilling()
      } else {
        setActionMsg(`📝 Invoice ${data.data.id} berhasil dibuat. (Siap disambungkan ke Payment Gateway pilihan Anda)`)
        fetchBilling()
      }
    } catch (err) {
      setActionMsg(`❌ ${err instanceof Error ? err.message : 'Gagal'}`)
    }
    setProcessingPlan(null)
  }

  // Calculate days left
  const getDaysLeft = (endDateStr?: string) => {
    if (!endDateStr) return 0
    const diff = new Date(endDateStr).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const selectedCustomerName = customers.find(c => c.id === selectedCustomerId)?.name || selectedCustomerId

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <span>💳</span> Billing & Langganan
          </h1>
          <p className="text-zinc-400 text-sm">
            Kelola paket langganan, kuota WABA, dan tagihan invoice bisnis Anda
          </p>
        </div>
      </div>

      {actionMsg && (
        <div className={`mb-6 p-4 rounded-xl text-sm border flex items-center justify-between ${
          actionMsg.startsWith('✅') ? 'bg-green-500/10 border-green-500/30 text-green-400' :
          actionMsg.startsWith('📝') ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
          'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Current Subscription Status Card */}
      {subscription && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs uppercase font-semibold tracking-wider text-zinc-500">Status Langganan saat ini</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${
                  subscription.status === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  subscription.status === 'trialing' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                  'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  {subscription.status}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white capitalize flex items-center gap-2">
                Paket {subscription.plan_tier}
                <span className="text-xs text-zinc-400 font-normal">({selectedCustomerName})</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Masa berlaku hingga <span className="text-white font-medium">{new Date(subscription.current_period_end).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span> ({getDaysLeft(subscription.current_period_end)} hari tersisa)
              </p>
            </div>

            {/* Limits Progress */}
            <div className="grid grid-cols-2 gap-4 bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 shrink-0">
              <div>
                <div className="text-[11px] text-zinc-500">WABA Accounts Limit</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  1 / <span className="text-zinc-400">{subscription.max_waba_accounts}</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Batas Leads / Bulan</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {subscription.max_leads_per_month > 50000 ? 'Unlimited' : `Hingga ${subscription.max_leads_per_month}`}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="mb-12">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-white">Pilihan Paket Langganan</h2>
          <p className="text-zinc-400 text-xs mt-1">Pilih paket yang paling sesuai dengan kebutuhan skala bisnis Anda</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const isCurrentPlan = subscription?.plan_tier === plan.key
            return (
              <div
                key={plan.key}
                className={`border rounded-2xl p-6 flex flex-col justify-between relative ${plan.color}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {plan.badge}
                    </span>
                    {isCurrentPlan && (
                      <span className="text-[10px] uppercase font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                        Aktif Sekarang
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-2xl font-bold text-white">{plan.price}</span>
                    <span className="text-xs text-zinc-400">{plan.period}</span>
                  </div>

                  <ul className="space-y-3 mb-8 text-xs text-zinc-300">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-green-400 shrink-0">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-4 border-t border-zinc-800">
                  <button
                    onClick={() => handleSelectPlan(plan.key, false)}
                    disabled={processingPlan === plan.key}
                    className={`w-full py-2.5 rounded-xl text-xs transition ${plan.btnColor} disabled:opacity-50`}
                  >
                    {processingPlan === plan.key ? 'Memproses...' : isCurrentPlan ? 'Perpanjang Paket' : 'Pilih Paket'}
                  </button>

                  <button
                    onClick={() => handleSelectPlan(plan.key, true)}
                    className="w-full py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition text-center block"
                  >
                    ⚡ Simualsi Aktifkan Langsung (Dev/Admin)
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment Gateway Agnostic Notice */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-2xl shrink-0 border border-zinc-700">
            🔌
          </div>
          <div>
            <h3 className="font-semibold text-sm text-white">Setup Payment Gateway</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Siap dihubungkan ke **Xendit**, **Midtrans**, **Mayar.id**, atau **Tripay**. Webhook `/api/webhooks/payment` siap menerima status pembayaran.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-xl text-zinc-400 shrink-0">
          <span>Webhook:</span>
          <span className="text-green-400">POST /api/webhooks/payment</span>
        </div>
      </div>

      {/* Invoice History Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white mb-4">Riwayat Invoice & Pembayaran</h2>

        {invoices.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs">
            Belum ada riwayat tagihan invoice untuk tenant ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2.5 px-3">Invoice ID</th>
                  <th className="text-left py-2.5 px-3">Paket</th>
                  <th className="text-left py-2.5 px-3">Jumlah</th>
                  <th className="text-left py-2.5 px-3">Metode</th>
                  <th className="text-left py-2.5 px-3">Status</th>
                  <th className="text-right py-2.5 px-3">Tanggal Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                    <td className="py-3 px-3 font-mono text-zinc-300">{inv.id}</td>
                    <td className="py-3 px-3 capitalize text-white font-medium">{inv.plan_tier}</td>
                    <td className="py-3 px-3 font-bold text-white">Rp {inv.amount.toLocaleString('id-ID')}</td>
                    <td className="py-3 px-3 uppercase text-zinc-400">{inv.payment_method || 'QRIS'}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        inv.status === 'paid' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        inv.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                        'bg-zinc-500/20 text-zinc-400 border border-zinc-700'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-zinc-500">
                      {new Date(inv.created_at).toLocaleString('id-ID')}
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
