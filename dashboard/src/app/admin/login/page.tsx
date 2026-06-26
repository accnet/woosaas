'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Shield } from 'lucide-react'
import { setAdminToken, adminApi } from '@/lib/admin/api'
import { getApiErrorMessage } from '@/lib/api'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.login(email, password)
      setAdminToken(res.data.token)
      router.push('/admin/users')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Admin login failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f1a] px-4 py-10">
      {/* Ambient glow */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute left-[10%] top-[15%] h-[300px] w-[300px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-[15%] right-[10%] h-[350px] w-[350px] rounded-full bg-cyan-500/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        <form
          onSubmit={submit}
          className="w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] shadow-[0_24px_64px_rgba(0,0,0,0.3)] backdrop-blur-xl"
        >
          {/* Header */}
          <div className="border-b border-white/[0.04] px-8 py-7">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 text-violet-400 ring-1 ring-inset ring-white/[0.08]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-admin-title text-xl font-bold tracking-tight text-white">Woosaas</h1>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-400/70">Platform Admin</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-5 px-8 py-7">
            {error ? (
              <div className="rounded-xl border border-red-500/15 bg-red-500/[0.06] px-4 py-3 text-xs text-red-400">
                {error}
              </div>
            ) : null}

            <label className="block space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Email</span>
              <input
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white placeholder-slate-500 transition-all focus:border-violet-500/40 focus:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-violet-500/10"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="admin@woosaas.com"
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Password</span>
              <input
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white placeholder-slate-500 transition-all focus:border-violet-500/40 focus:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-violet-500/10"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="••••••••"
                required
              />
            </label>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/15 transition-all hover:from-violet-500 hover:to-violet-600 hover:shadow-violet-500/25 active:scale-[0.98] disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign in'}
              {!loading ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
