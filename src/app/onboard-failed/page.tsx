export default function OnboardFailedPage({
  searchParams,
}: {
  searchParams: { customer_id?: string; status?: string; reason?: string }
}) {
  const { customer_id, reason } = searchParams

  const reasonMessages: Record<string, string> = {
    signup_cancelled: 'Anda membatalkan proses pendaftaran Meta.',
    token_exchange_failed: 'Gagal menukar token. Silakan coba lagi.',
    token_info_failed: 'Gagal memverifikasi token. Silakan coba lagi.',
    no_waba_found: 'Tidak ditemukan akun WhatsApp Business. Pastikan Anda memiliki akun WA Business.',
    phone_lookup_failed: 'Gagal menemukan nomor telepon. Silakan coba lagi.',
    account_limit_reached: 'Batas akun tercapai. Hubungi admin.',
    coexistence_mismatch: 'Kesalahan konfigurasi. Hubungi admin.',
    already_onboarded: 'Akun ini sudah terhubung sebelumnya.',
  }

  const message = reason ? reasonMessages[reason] || `Gagal: ${reason}` : 'Terjadi kesalahan saat menghubungkan WhatsApp.'

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="max-w-md w-full bg-zinc-900 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">❌</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">Gagal Terhubung</h1>
        <p className="text-zinc-400 mb-6">{message}</p>

        {customer_id && (
          <div className="bg-zinc-800 rounded-lg p-4 text-left text-sm mb-6">
            <div className="flex justify-between">
              <span className="text-zinc-500">Customer ID</span>
              <span className="font-mono">{customer_id}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <a
            href="/dashboard"
            className="flex-1 bg-zinc-800 text-zinc-100 rounded-xl py-3 font-semibold hover:bg-zinc-700 transition text-center"
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
