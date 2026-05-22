'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi, getApiErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export default function ActivatePage() {
  return (
    <Suspense fallback={<ActivationShell status="loading" message="Activating your account..." />}>
      <ActivateContent />
    </Suspense>
  )
}

function ActivateContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuthStore()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Activating your account...')

  useEffect(() => {
    const token = searchParams.get('token') || ''
    if (!token) {
      setStatus('error')
      setMessage('Activation link is missing a token.')
      return
    }

    let cancelled = false
    const activate = async () => {
      try {
        const response = await authApi.activate(token)
        if (cancelled) return
        login(response.data.token, response.data.user)
        setStatus('success')
        setMessage('Your account is active. Redirecting to your dashboard...')
        window.setTimeout(() => router.replace('/dashboard/sites'), 900)
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setMessage(getApiErrorMessage(error, 'Activation link is invalid or expired.'))
      }
    }

    void activate()
    return () => {
      cancelled = true
    }
  }, [login, router, searchParams])

  return <ActivationShell status={status} message={message} />
}

function ActivationShell({ status, message }: { status: 'loading' | 'success' | 'error'; message: string }) {
  const title = status === 'success' ? 'Account activated' : status === 'error' ? 'Activation failed' : 'Activating account'
  const tone = status === 'success' ? 'bg-emerald-50 text-emerald-700' : status === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-radial bg-app px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className={`mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>
          {status === 'loading' ? (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={status === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
            </svg>
          )}
        </div>
        <h1 className="text-xl font-semibold text-app-strong">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-app-muted">{message}</p>
        {status === 'error' ? (
          <div className="mt-6">
            <Link href="/login" className="btn-secondary w-full">
              Back to sign in
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
