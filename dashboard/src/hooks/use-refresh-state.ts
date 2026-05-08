import { useState } from 'react'

export function useRefreshState() {
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  const startRefresh = () => setRefreshing(true)
  const endRefresh = () => {
    setRefreshing(false)
    setLastUpdated(new Date())
  }
  
  return { refreshing, lastUpdated, startRefresh, endRefresh }
}
