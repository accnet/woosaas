export function formatRelativeTimeLabel(value?: string | null) {
  if (!value) {
    return 'No recent signal'
  }

  const date = new Date(value)
  const timestamp = date.getTime()
  if (Number.isNaN(timestamp)) {
    return 'Invalid timestamp'
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (diffMinutes < 1) {
    return 'Just now'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}
