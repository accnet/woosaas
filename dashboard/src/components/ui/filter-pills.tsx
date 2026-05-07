export function FilterPills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; count?: number }>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => {
        const isActive = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
              isActive ? 'bg-app-strong text-white shadow-soft' : 'bg-slate-50 text-app-muted hover:bg-slate-100'
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={`ml-2 text-xs ${isActive ? 'text-slate-200' : 'text-app-soft'}`}>
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
