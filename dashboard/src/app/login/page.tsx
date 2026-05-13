'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, getApiErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { hasHydrated, isAuthenticated, login } = useAuthStore()
  const postLoginHref = '/dashboard/sites'

  useEffect(() => {
    if (hasHydrated && isAuthenticated) {
      router.replace(postLoginHref)
    }
  }, [hasHydrated, isAuthenticated, postLoginHref, router])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authApi.login(email, password)
      login(response.data.token, response.data.user)
      router.push(postLoginHref)
    } catch (error) {
      setError(getApiErrorMessage(error, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-radial bg-app flex items-center justify-center">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-40" />

      {/* Gradient orbs */}
      <div className="absolute -right-48 top-1/4 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute -left-48 bottom-1/4 h-[400px] w-[400px] rounded-full bg-indigo-500/8 blur-3xl" />
      <div className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-blue-400/6 blur-3xl" />

      {/* Floating decorative stat cards */}
      <div className="pointer-events-none absolute right-[8%] top-[12%] hidden animate-float xl:block">
        <div className="card-static w-52 rounded-xl px-4 py-3 opacity-80">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-app-soft">Pageviews Today</div>
          <div className="mt-1.5 text-2xl font-bold text-app-strong">12,847</div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M7 17L17 7M17 7H7M17 7v10" /></svg>
            +18.4%
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-[18%] right-[6%] hidden animate-float-delayed xl:block">
        <div className="card-static w-48 rounded-xl px-4 py-3 opacity-75">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-app-soft">Revenue</div>
          <div className="mt-1.5 text-xl font-bold text-emerald-700">$4,209.80</div>
          <div className="mt-1 text-xs text-app-muted">Last 7 days</div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-[7%] top-[25%] hidden animate-float-slow xl:block">
        <div className="card-static w-44 rounded-xl px-4 py-3 opacity-70">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-app-soft">Conversion</div>
          <div className="mt-1.5 text-xl font-bold text-app-strong">3.24%</div>
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-700">Tracking live</span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-[28%] left-[9%] hidden animate-float xl:block" style={{ animationDelay: '3s' }}>
        <div className="card-static w-40 rounded-xl px-4 py-3 opacity-65">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-app-soft">Active Users</div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="text-xl font-bold text-app-strong">147</div>
            <div className="relative h-2.5 w-2.5">
              <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <div className="absolute inset-0 rounded-full bg-emerald-500" />
            </div>
          </div>
          <div className="mt-1 text-xs text-app-muted">Right now</div>
        </div>
      </div>

      {/* Login card */}
      <div className="relative w-full max-w-md mx-4 z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl shadow-soft mb-4" style={{ background: 'linear-gradient(135deg, #1a7cf8 0%, #0f6cde 60%, #0a56c0 100%)' }}>
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 7l-8 8-4-4-6 6" />
              <path d="M16 7h6v6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-app-strong">Welcome back</h1>
          <p className="text-app-muted mt-1">Sign in to your Woosaas Analytics account</p>
        </div>

        <div className="card-glass p-8">
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-app-strong mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-app-strong mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-app-muted">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="link">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
