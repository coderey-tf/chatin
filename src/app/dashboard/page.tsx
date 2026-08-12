import { listCustomers, getDashboardStats } from '@/lib/db'
import Link from 'next/link'

export default async function DashboardPage() {
  const [customers, dbStats] = await Promise.all([
    listCustomers(),
    getDashboardStats(),
  ])

  const myBusiness = customers[0]

  const mainStats = [
    {
      label: 'Status WhatsApp WABA',
      value: myBusiness?.phone_number ? 'Terhubung 🟢' : 'Pending ⏳',
      total: myBusiness?.phone_number || 'Belum tersambung',
      color: 'from-emerald-500/20 to-teal-500/5 text-emerald-400 border-emerald-500/30',
      icon: (
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: 'Leads Terkumpul',
      value: dbStats.totalLeads.toLocaleString('id-ID'),
      total: `+${dbStats.todayLeads} hari ini`,
      color: 'from-blue-500/20 to-indigo-500/5 text-blue-400 border-blue-500/30',
      icon: (
        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Pesan Diproses',
      value: dbStats.totalMessages.toLocaleString('id-ID'),
      total: `+${dbStats.todayMessages} pesan hari ini`,
      color: 'from-purple-500/20 to-pink-500/5 text-purple-400 border-purple-500/30',
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">WhatsApp Business Engine Active</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {myBusiness ? `Dashboard ${myBusiness.name}` : 'Dashboard WhatsApp Business'}
          </h1>
          <p className="text-xs text-zinc-400">
            Kelola percakapan pelanggan, otomatisasi chatbot lead collector, dan langganan WhatsApp Anda
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/dashboard/inbox"
            className="flex items-center gap-2 bg-emerald-500 text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20"
          >
            <span>💬 Buka Live Inbox</span>
          </Link>
          <Link
            href="/dashboard/bot"
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-4 py-2.5 rounded-xl text-xs transition border border-zinc-700"
          >
            <span>🤖 Setting Bot</span>
          </Link>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {mainStats.map((s) => (
          <div
            key={s.label}
            className={`bg-gradient-to-br ${s.color} bg-zinc-900 border rounded-2xl p-6 relative overflow-hidden transition hover:border-zinc-700`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{s.label}</span>
              <div className="w-9 h-9 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-center">
                {s.icon}
              </div>
            </div>
            <div className="text-2xl font-extrabold text-white tracking-tight mb-1">{s.value}</div>
            <div className="text-xs text-zinc-400 font-medium">{s.total}</div>
          </div>
        ))}
      </div>

      {/* Quick Access Feature Cards for Client */}
      <div>
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Menu & Akses Cepat</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard/inbox"
            className="group bg-zinc-900/80 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-emerald-500/40 rounded-2xl p-5 transition-all"
          >
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center text-lg mb-3 group-hover:scale-110 transition-transform">
              💬
            </div>
            <h3 className="font-semibold text-sm text-white group-hover:text-emerald-400 transition-colors">Live Conversation Inbox</h3>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Balas percakapan WhatsApp secara langsung dengan indikator Jendela 24 jam.</p>
          </Link>

          <Link
            href="/dashboard/bot"
            className="group bg-zinc-900/80 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-blue-500/40 rounded-2xl p-5 transition-all"
          >
            <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center text-lg mb-3 group-hover:scale-110 transition-transform">
              🤖
            </div>
            <h3 className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors">Pengaturan Chatbot</h3>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Atur pesan greeting, pertanyaan informasi lead, dan link pricelist produk Anda.</p>
          </Link>

          <Link
            href="/dashboard/leads"
            className="group bg-zinc-900/80 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-purple-500/40 rounded-2xl p-5 transition-all"
          >
            <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center text-lg mb-3 group-hover:scale-110 transition-transform">
              📊
            </div>
            <h3 className="font-semibold text-sm text-white group-hover:text-purple-400 transition-colors">Manajemen Data Leads</h3>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Lihat data prospek pembeli, update status prospek, dan ekspor ke format CSV.</p>
          </Link>

          <Link
            href="/dashboard/billing"
            className="group bg-zinc-900/80 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-amber-500/40 rounded-2xl p-5 transition-all"
          >
            <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center text-lg mb-3 group-hover:scale-110 transition-transform">
              💳
            </div>
            <h3 className="font-semibold text-sm text-white group-hover:text-amber-400 transition-colors">Langganan & WABA</h3>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Cek masa aktif paket langganan, kuota percakapan, dan koneksi nomor WhatsApp.</p>
          </Link>
        </div>
      </div>

    </div>
  )
}
