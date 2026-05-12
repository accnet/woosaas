'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/ui/dashboard-shell'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { UserSettingsProvider } from '@/lib/settings-context'
import { useAuthStore } from '@/store/auth'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { hasHydrated, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.replace('/login')
    }
  }, [hasHydrated, isAuthenticated, router])

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <UserSettingsProvider>
      <DashboardShell>{children}</DashboardShell>
    </UserSettingsProvider>
  )
}
