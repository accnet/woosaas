import { Search } from 'lucide-react'

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
  onKeyDown,
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className={`relative ${className}`.trim()}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="input pl-9"
      />
    </div>
  )
}
