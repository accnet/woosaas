export function AnalyticsPageSkeleton({ cols = 4 }: { cols?: 2 | 4 | 5 }) {
  const colClass = cols === 5 ? 'xl:grid-cols-5' : cols === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-4'

  return (
    <div className="animate-pulse space-y-5">
      {/* Header skeleton */}
      <div className="panel-header">
        <div className="min-w-0">
          <div className="h-7 w-52 rounded-md bg-slate-200" />
          <div className="mt-2 h-4 w-80 rounded-md bg-slate-100" />
        </div>
        <div className="h-9 w-36 rounded-md bg-slate-200" />
      </div>

      {/* Metric cards skeleton */}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${colClass}`}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="card px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="h-8 w-8 rounded-md bg-slate-200" />
            </div>
            <div className="mt-3 h-9 w-28 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="card px-6 py-6">
        <div className="panel-header">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-slate-200" />
            <div>
              <div className="h-4 w-36 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-64 rounded bg-slate-100" />
            </div>
          </div>
        </div>
        <div className="mt-4 h-72 w-full rounded-lg bg-gradient-to-br from-slate-100 to-slate-50" />
      </div>

      {/* Table skeleton */}
      <div className="card overflow-hidden">
        <div className="border-b border-app-line px-6 py-4">
          <div className="h-4 w-32 rounded bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-3.5">
              <div className="h-4 flex-1 rounded bg-slate-100" style={{ opacity: 1 - i * 0.12 }} />
              <div className="h-4 w-16 rounded bg-slate-100" />
              <div className="h-4 w-16 rounded bg-slate-100" />
              <div className="h-4 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
