interface LoadingSpinnerProps {
  className?: string
}

export function LoadingSpinner({ className = 'p-8' }: LoadingSpinnerProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  )
}
