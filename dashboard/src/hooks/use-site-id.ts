'use client'

import { useParams } from 'next/navigation'

export function useSiteId() {
  const params = useParams<{ siteId: string }>()
  return params.siteId
}
