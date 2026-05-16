'use client'

import { Suspense } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { NewTemplatePage } from '../template-form'

export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner className="py-16" />}>
      <NewTemplatePage />
    </Suspense>
  )
}
