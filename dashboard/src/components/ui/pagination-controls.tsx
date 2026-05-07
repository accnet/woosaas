import { ChevronLeft, ChevronRight } from 'lucide-react'

export function PaginationControls({
  page,
  totalPages,
  onPrevious,
  onNext,
}: {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-app-line bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-app-muted">
        Page {page} of {totalPages}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrevious} disabled={page === 1} className="btn-secondary gap-2">
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page === totalPages}
          className="btn-secondary gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
