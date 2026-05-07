interface CardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
}

export function Card({ title, value, change, changeType = 'neutral' }: CardProps) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
      {change && (
        <div
          className={`stat-change ${
            changeType === 'positive'
              ? 'text-emerald-600'
              : changeType === 'negative'
              ? 'text-red-600'
              : 'text-surface-500'
          }`}
        >
          {change}
        </div>
      )}
    </div>
  )
}
