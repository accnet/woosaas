'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, Boxes, ClipboardList, LogOut, Settings, ShieldCheck, Users } from 'lucide-react'
import { adminApi, clearAdminToken, getAdminToken, type AdminMe } from '@/lib/admin/api'

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
  const [admin, setAdmin] = useState<AdminMe | null>(null)
  const isLoginPage = pathname === '/admin/login'
  const currentSection = nav.find((item) => item.href === pathname)?.label || 'Admin'

  useEffect(() => {
    if (isLoginPage) {
      return
    }
    if (!getAdminToken()) {
      router.replace('/admin/login')
      return
    }
    let ignore = false
    void adminApi.me().then((res) => {
      if (!ignore) {
        setAdmin(res.data.admin)
      }
    }).catch(() => {})
    return () => {
      ignore = true
    }
  }, [isLoginPage, router])

  const logout = () => {
    clearAdminToken()
    router.replace('/admin/login')
  }

  if (isLoginPage) return children

  return (
    <div className="min-h-screen bg-admin-mesh text-slate-800">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200/20 bg-gradient-to-b from-[#0a0f1d] to-[#070b14] px-5 py-6 text-slate-100 shadow-[18px_0_60px_rgba(2,6,23,0.18)] lg:block">
        <div className="mb-8 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 shadow-sm ring-1 ring-inset ring-cyan-400/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-admin-title text-sm font-bold tracking-tight text-white">Woosaas Console</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/80">Platform Ops</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.04] bg-slate-950/45 px-3.5 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{currentSection}</div>
            <div className="mt-1 truncate text-sm font-semibold text-white">{admin?.full_name || 'Platform Admin'}</div>
            <div className="truncate text-xs text-slate-400/90">{admin?.email || 'Loading credentials...'}</div>
          </div>
        </div>
        <nav className="space-y-1.5">
          {nav.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-glow-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  active
                    ? 'active bg-white/[0.06] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                    : 'text-slate-400 hover:bg-white/[0.03] hover:text-white'
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ${active ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/[0.02] text-slate-500'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <button onClick={logout} className="absolute bottom-6 left-5 right-5 inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm font-semibold text-slate-300 transition-all hover:bg-white/[0.06] hover:text-white">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>
      <div className="sticky top-0 z-20 border-b border-slate-200/50 bg-white/75 px-4 py-3.5 shadow-sm backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-600 animate-pulse" />
            <span className="font-admin-title text-sm font-bold text-slate-900">Woosaas Admin</span>
          </div>
          <button onClick={logout} className="admin-btn-secondary gap-2 px-3 py-1.5 text-xs">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200/60 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-600">
          <div className="font-semibold text-slate-900">{admin?.full_name || 'Platform Admin'}</div>
          <div className="truncate text-slate-500">{admin?.email || 'Loading...'}</div>
        </div>
        <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {nav.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${active ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <main className="lg:pl-72 animate-fade-in">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
