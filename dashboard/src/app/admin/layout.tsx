'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, Boxes, ClipboardList, LogOut, Settings, ShieldCheck, Users } from 'lucide-react'
import { clearAdminToken } from '@/lib/admin/api'

const nav = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/plans', label: 'Plans', icon: Boxes },
  { href: '/admin/tracking-providers', label: 'Tracking Providers', icon: Activity },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/audit', label: 'Audit', icon: ClipboardList },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  if (pathname === '/admin/login') return children

  const logout = () => {
    clearAdminToken()
    router.replace('/admin/login')
  }

  return (
    <div className="min-h-screen bg-app-bg text-app-primary">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-app-border bg-app-surface px-4 py-5 shadow-sm lg:block">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-app-accent text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-app-primary">Woosaas Admin</div>
            <div className="text-xs text-app-muted">Operations console</div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? 'nav-item-active' : 'nav-item-idle'}`}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <button onClick={logout} className="btn-secondary absolute bottom-5 left-4 right-4 gap-2">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>
      <div className="sticky top-0 z-20 border-b border-app-border bg-app-surface px-4 py-3 shadow-sm lg:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-app-accent" />
            <span className="text-sm font-semibold">Woosaas Admin</span>
          </div>
          <button onClick={logout} className="btn-secondary gap-2 text-xs">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {nav.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm ${active ? 'border-app-accent bg-app-accent text-white' : 'border-app-border bg-app-bg text-app-muted'}`}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  )
}
