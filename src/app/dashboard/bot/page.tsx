import { listCustomers } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function ClientBotRedirectPage() {
  const customers = await listCustomers()
  if (customers.length > 0) {
    redirect(`/dashboard/customers/${customers[0].id}/bot`)
  }

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full">
        <div className="text-4xl mb-3">🤖</div>
        <h2 className="text-xl font-bold text-white mb-2">Belum Ada Bot Config</h2>
        <p className="text-zinc-400 text-xs mb-6">
          Silakan jalankan script SQL Migration Supabase di SQL Editor terlebih dahulu atau tambahkan tenant customer pertama Anda.
        </p>
        <Link
          href="/dashboard/customers/new"
          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl text-xs transition inline-block"
        >
          + Tambah Customer Pertama
        </Link>
      </div>
    </div>
  )
}
