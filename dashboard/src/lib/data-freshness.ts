export type DataFreshnessState = {
  label: 'Live' | 'Fresh' | 'Idle' | 'Stale' | 'No events'
  detail: string
  changeType: 'positive' | 'neutral' | 'negative'
}

export function getDataFreshnessState(lastEventAt: string | null): DataFreshnessState {
  if (!lastEventAt) {
    return {
      label: 'No events',
      detail: 'No tracked events have reached this site yet.',
      changeType: 'negative',
    }
  }

  const ageMs = Date.now() - new Date(lastEventAt).getTime()
  const minutes = Math.max(1, Math.round(ageMs / 60000))

  if (minutes <= 15) {
    return {
      label: 'Live',
      detail: `Latest event arrived ${formatAge(minutes)} ago.`,
      changeType: 'positive',
    }
  }

  if (minutes <= 180) {
    return {
      label: 'Fresh',
      detail: `Latest event arrived ${formatAge(minutes)} ago.`,
      changeType: 'positive',
    }
  }

  if (minutes <= 1440) {
    return {
      label: 'Idle',
      detail: `Latest event arrived ${formatAge(minutes)} ago.`,
      changeType: 'neutral',
    }
  }

  return {
    label: 'Stale',
    detail: `Latest event arrived ${formatAge(minutes)} ago.`,
    changeType: 'negative',
  }
}

function formatAge(minutes: number) {
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }

  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
