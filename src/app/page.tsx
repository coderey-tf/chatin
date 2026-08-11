import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-zinc-900 rounded-full px-4 py-2 text-sm text-zinc-400 mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Multi-tenant WhatsApp via KirimDev
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            📱 Chatin
          </h1>

          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
            Dashboard untuk mengelola WhatsApp Business API multi-tenant.
            Connect customer, generate setup link, kirim pesan atas nama mereka.
          </p>

          <div className="flex gap-4 justify-center">
            <Link
              href="/dashboard"
              className="bg-white text-zinc-900 px-8 py-3 rounded-full font-semibold hover:bg-zinc-100 transition"
            >
              Buka Dashboard
            </Link>
            <Link
              href="https://docs.kirimdev.com/platform/"
              target="_blank"
              className="bg-zinc-900 text-zinc-100 px-8 py-3 rounded-full font-semibold hover:bg-zinc-800 transition border border-zinc-800"
            >
              Docs KirimDev
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="bg-zinc-900 rounded-2xl p-6">
            <div className="text-2xl mb-3">👥</div>
            <h3 className="font-semibold mb-2">Multi-Tenant</h3>
            <p className="text-sm text-zinc-500">
              Kelola banyak klien, masing-masing punya nomor WhatsApp sendiri. Isolasi data sempurna.
            </p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-6">
            <div className="text-2xl mb-3">🔗</div>
            <h3 className="font-semibold mb-2">Setup Link</h3>
            <p className="text-sm text-zinc-500">
              Generate one-time link. Customer buka link → Meta Embedded Signup → WhatsApp connected.
            </p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-6">
            <div className="text-2xl mb-3">📤</div>
            <h3 className="font-semibold mb-2">Send Messages</h3>
            <p className="text-sm text-zinc-500">
              Kirim pesan atas nama customer. Payload sama dengan Meta Cloud API, drop-in compatible.
            </p>
          </div>
        </div>

        {/* Flow */}
        <div className="bg-zinc-900 rounded-2xl p-8">
          <h2 className="text-lg font-semibold mb-6">How it Works</h2>
          <div className="flex flex-col md:flex-row gap-4 text-sm">
            <div className="flex-1 bg-zinc-800 rounded-xl p-4">
              <div className="text-zinc-500 mb-2">01</div>
              <div className="font-medium">Add Customer</div>
              <div className="text-zinc-500 mt-1">Buat customer baru di dashboard</div>
            </div>
            <div className="flex items-center justify-center text-zinc-600">→</div>
            <div className="flex-1 bg-zinc-800 rounded-xl p-4">
              <div className="text-zinc-500 mb-2">02</div>
              <div className="font-medium">Generate Link</div>
              <div className="text-zinc-500 mt-1">Buat setup link & kirim ke customer</div>
            </div>
            <div className="flex items-center justify-center text-zinc-600">→</div>
            <div className="flex-1 bg-zinc-800 rounded-xl p-4">
              <div className="text-zinc-500 mb-2">03</div>
              <div className="font-medium">Onboarding</div>
              <div className="text-zinc-500 mt-1">Customer connect WA via Embedded Signup</div>
            </div>
            <div className="flex items-center justify-center text-zinc-600">→</div>
            <div className="flex-1 bg-zinc-800 rounded-xl p-4">
              <div className="text-zinc-500 mb-2">04</div>
              <div className="font-medium">Send</div>
              <div className="text-zinc-500 mt-1">Kirim pesan atas nama customer</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-600">
        Built with KirimDev • <code className="bg-zinc-900 px-2 py-1 rounded">chatin.coderey.dev</code>
      </div>
    </div>
  )
}
