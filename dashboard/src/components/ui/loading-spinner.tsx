interface LoadingSpinnerProps {
  className?: string
}

export function LoadingSpinner({ className = 'p-8' }: LoadingSpinnerProps) {
  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="h-10 w-10 rounded-full border-2 border-surface-200" />
          <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-primary-500" />
        </div>
        <span className="text-sm text-surface-400">Loading...</span>
      </div>
    </div>
  )
}
