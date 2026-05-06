interface CardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
}

export function Card({ title, value, change, changeType = 'neutral' }: CardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {change && (
        <p
          className={`text-sm mt-2 ${
            changeType === 'positive'
              ? 'text-green-600'
              : changeType === 'negative'
              ? 'text-red-600'
              : 'text-gray-600'
          }`}
        >
          {change}
        </p>
      )}
    </div>
  )
}