import { listCustomers } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import LeadsClient from '../customers/[id]/leads/LeadsClient'

export default async function DashboardLeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const customers = await listCustomers(undefined, user?.id, user?.email ?? undefined)

  if (customers.length === 0) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full">
          <div className="text-4xl mb-3">📊</div>
          <h2 className="text-xl font-bold text-white mb-2">Belum Ada Data Leads</h2>
          <p className="text-zinc-400 text-xs mb-6">
            Silakan hubungkan akun WhatsApp Business API Anda terlebih dahulu untuk melihat data leads.
          </p>
          <Link
            href="/dashboard/customers/new"
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl text-xs transition inline-block"
          >
            + Connect WhatsApp Business
          </Link>
        </div>
      </div>
    )
  }

  const customerId = customers[0].id

  return <LeadsClient customerId={customerId} />
}
