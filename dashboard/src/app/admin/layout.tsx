'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, Box, ClipboardList, LogOut, Settings, Shield, Users } from 'lucide-react'
import { adminApi, clearAdminToken, getAdminToken, type AdminMe } from '@/lib/admin/api'

const nav = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/plans', label: 'Plans', icon: Box },
  { href: '/admin/tracking-providers', label: 'Providers', icon: Activity },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/audit', label: 'Audit Log', icon: ClipboardList },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminMe | null>(null)
  const isLoginPage = pathname === '/admin/login'

  useEffect(() => {
    if (isLoginPage) return
    if (!getAdminToken()) {
      router.replace('/admin/login')
      return
    }
    let ignore = false
    void adminApi.me().then((res) => {
      if (!ignore) setAdmin(res.data.admin)
    }).catch(() => {})
    return () => { ignore = true }
  }, [isLoginPage, router])

  const logout = () => {
    clearAdminToken()
    router.replace('/admin/login')
  }

  if (isLoginPage) return children

  return (
    <div className="min-h-screen bg-admin-mesh text-slate-800">
      {/* ── Desktop Sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/[0.06] bg-[#0b0f1a] lg:flex">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 text-violet-400 ring-1 ring-inset ring-white/[0.08]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="font-admin-title text-sm font-bold tracking-tight text-white">Woosaas</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-400/70">Platform Admin</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-glow-item group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ${
                  active
                    ? 'bg-violet-500/20 text-violet-300 shadow-sm'
                    : 'bg-white/[0.03] text-slate-500 group-hover:bg-white/[0.06] group-hover:text-slate-300'
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Admin Profile Card */}
        <div className="mx-4 mb-3 rounded-2xl border border-white/[0.05] bg-white/[0.03] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-xs font-bold text-white">
              {admin?.full_name?.charAt(0) || 'A'}
            </div>
            <div>
              <div className="text-xs font-semibold text-white">{admin?.full_name || 'Admin'}</div>
              <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{admin?.email || '...'}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-violet-500/[0.06] px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Active Session</span>
          </div>
        </div>

        {/* Logout */}
        <div className="px-4 pb-6 pt-2">
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-2.5 text-sm font-medium text-slate-400 transition-all hover:border-red-500/20 hover:bg-red-500/[0.06] hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile Header ── */}
      <div className="sticky top-0 z-20 border-b border-slate-200/50 bg-white/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20">
              <Shield className="h-4 w-4 text-violet-500" />
            </div>
            <span className="font-admin-title text-sm font-bold text-slate-900">Woosaas Admin</span>
          </div>
          <button onClick={logout} className="admin-btn-secondary gap-1.5 px-3 py-1.5 text-xs">
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
        <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {nav.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'border-violet-500 bg-violet-500 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <Icon className="h-3 w-3" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* ── Main Content ── */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
