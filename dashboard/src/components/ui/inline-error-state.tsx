import { AlertTriangle, RefreshCw } from 'lucide-react'

export function InlineErrorState({
  title = 'Unable to load data',
  body,
  onRetry,
  compact = false,
}: {
  title?: string
  body: string
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div
      className={`rounded-lg border border-red-200 bg-red-50 ${
        compact ? 'px-4 py-3' : 'px-5 py-4'
      }`.trim()}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-white text-red-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-red-700">{title}</div>
            <p className="mt-1 text-sm text-red-700">{body}</p>
          </div>
        </div>
        {onRetry ? (
          <button type="button" className="btn-secondary shrink-0 gap-2" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        ) : null}
      </div>
    </div>
  )
}
