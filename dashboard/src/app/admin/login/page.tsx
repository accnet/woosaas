'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
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
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-xl">
        <div className="border-b border-app-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-app-accent text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-app-primary">Woosaas Admin</h1>
              <p className="text-sm text-app-muted">Operations console</p>
            </div>
          </div>
        </div>
        <div className="space-y-5 px-6 py-5">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <label className="block space-y-1">
          <span className="text-sm text-app-muted">Email</span>
          <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-app-muted">Password</span>
          <input className="input" value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        </div>
      </form>
    </main>
  )
}
