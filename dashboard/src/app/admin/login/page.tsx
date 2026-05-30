'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, ShieldCheck } from 'lucide-react'
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-tr from-[#030712] via-[#090f1d] to-[#0f172a] px-4 py-10">
      <div className="absolute inset-0 opacity-40">
        <div className="absolute left-[8%] top-[12%] h-[350px] w-[350px] rounded-full bg-cyan-500/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-[12%] right-[10%] h-[400px] w-[400px] rounded-full bg-indigo-500/10 blur-3xl animate-pulse" />
      </div>
      <div className="relative w-full max-w-md animate-fade-in">
        <form onSubmit={submit} className="w-full overflow-hidden rounded-[24px] border border-slate-200/10 bg-white/[0.03] shadow-[0_30px_80px_rgba(2,6,23,0.35)] backdrop-blur-xl">
          <div className="border-b border-white/[0.04] bg-white/[0.01] px-8 py-7">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 text-white shadow-lg shadow-cyan-500/20">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-admin-title text-xl font-bold tracking-tight text-white">Woosaas Console</h1>
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/80">Secured Gatekeeper</p>
              </div>
            </div>
          </div>
          <div className="space-y-6 px-8 py-8">
            <div className="rounded-xl border border-white/[0.04] bg-slate-950/45 px-4 py-3 text-xs text-slate-400">
              Demo Identity: <span className="font-mono font-bold text-white">admin@woosaas.com</span>
            </div>
            {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{error}</div> : null}
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Email Address</span>
              <input className="admin-input-premium h-12 !border-white/10 !bg-white/[0.02] text-white placeholder-slate-500 focus:!border-cyan-500 focus:!bg-white/[0.04]" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="admin@woosaas.com" required />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Security Password</span>
              <input className="admin-input-premium h-12 !border-white/10 !bg-white/[0.02] text-white placeholder-slate-500 focus:!border-cyan-500 focus:!bg-white/[0.04]" value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" required />
            </label>
            <button className="admin-btn-primary h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-700 text-sm hover:from-cyan-400 hover:to-cyan-600 focus:ring-2 focus:ring-cyan-500/20" disabled={loading}>
              {loading ? 'Decrypting credentials...' : 'Authenticate Identity'}
              {!loading ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
