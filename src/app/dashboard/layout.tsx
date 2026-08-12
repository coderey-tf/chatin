import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile, listCustomers, setOnboardedStatus } from '@/lib/db'
import { Sidebar } from './Sidebar'

export const metadata: Metadata = {
  title: 'Chatin — Multi-Tenant WhatsApp Business API Dashboard',
  description: 'Manage WABA clients, lead collection chatbot, and live inbox',
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=/dashboard')
  }

  // Check onboarding status
  const profile = await getUserProfile(user.id)
  const customers = await listCustomers()

  if (customers.length > 0) {
    // If user already has customer(s), ensure is_onboarded is true so they stay logged in
    if (!profile || profile.is_onboarded === false) {
      await setOnboardedStatus(user.id, true)
    }
  } else if (profile && profile.is_onboarded === false) {
    // Only redirect to /onboarding if user has 0 customers and hasn't onboarded
    redirect('/onboarding')
  }

  const userEmail = user?.email
  const userName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* Sidebar (Desktop + Mobile Drawer) */}
      <Sidebar userEmail={userEmail} userName={userName} avatarUrl={avatarUrl} />

      {/* Main Content Area */}
      <div className="lg:ml-64 flex flex-col min-h-screen">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

    </div>
  )
}
