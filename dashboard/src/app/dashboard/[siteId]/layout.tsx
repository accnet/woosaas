'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const siteId = params.siteId as string

  const navItems = [
    { href: `/dashboard/${siteId}/overview`, label: 'Overview', icon: '📊' },
    { href: `/dashboard/${siteId}/sources`, label: 'Sources', icon: '🔍' },
    { href: `/dashboard/${siteId}/funnel`, label: 'Funnel', icon: '📈' },
    { href: `/dashboard/${siteId}/realtime`, label: 'Realtime', icon: '⚡' },
    { href: `/dashboard/${siteId}/bots`, label: 'Bots', icon: '🤖' },
  ]

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center">
              <Link
                href="/dashboard/sites"
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                ← Back to Sites
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}