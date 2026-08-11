export default function OnboardedPage({
  searchParams,
}: {
  searchParams: { customer_id?: string; account_id?: string; status?: string }
}) {
  const { customer_id, account_id, status } = searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="max-w-md w-full bg-zinc-900 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">WhatsApp Terhubung!</h1>
        <p className="text-zinc-400 mb-6">
          Nomor WhatsApp berhasil terhubung ke platform.
        </p>

        {customer_id && (
          <div className="bg-zinc-800 rounded-lg p-4 text-left text-sm mb-6 space-y-2">
            <div className="flex justify-between">
              <span className="text-zinc-500">Customer ID</span>
              <span className="font-mono">{customer_id}</span>
            </div>
            {account_id && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Account ID</span>
                <span className="font-mono text-xs">{account_id}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-zinc-500">Status</span>
              <span className="text-green-400">{status || 'success'}</span>
            </div>
          </div>
        )}

        <a
          href="/dashboard"
          className="block w-full bg-white text-zinc-900 rounded-xl py-3 font-semibold hover:bg-zinc-100 transition"
        >
          Kembali ke Dashboard
        </a>
      </div>
    </div>
  )
}
