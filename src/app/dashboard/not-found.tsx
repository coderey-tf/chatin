import Link from 'next/link'

export default function DashboardNotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full">
        <div className="text-4xl mb-4">🔍</div>
        <h2 className="text-xl font-bold mb-2">Halaman Tidak Ditemukan</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Halaman atau data yang Anda cari tidak ditemukan atau telah dihapus.
        </p>
        <Link
          href="/dashboard"
          className="bg-white text-zinc-900 font-semibold px-6 py-2.5 rounded-xl hover:bg-zinc-100 transition text-sm inline-block"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  )
}
