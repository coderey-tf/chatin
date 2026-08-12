export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse max-w-7xl mx-auto">
      <div className="h-8 bg-zinc-900 rounded-xl w-48"></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-zinc-900 rounded-2xl border border-zinc-800"></div>
        ))}
      </div>
      <div className="h-64 bg-zinc-900 rounded-2xl border border-zinc-800"></div>
    </div>
  )
}
