'use client'

import { Suspense, use } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { EditTemplatePage } from '../../template-form'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={<LoadingSpinner className="py-16" />}>
      <EditTemplatePage templateId={id} />
    </Suspense>
  )
}
