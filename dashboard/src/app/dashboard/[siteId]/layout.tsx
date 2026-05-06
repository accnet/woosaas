'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSiteId } from '@/hooks/use-site-id'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const siteId = useSiteId()
  const pathname = usePathname()

  const navItems = [
    { href: `/dashboard/${siteId}/overview`, label: 'Overview', icon: '📊' },
    { href: `/dashboard/${siteId}/trend`, label: 'Trend', icon: '📉' },
    { href: `/dashboard/${siteId}/sources`, label: 'Sources', icon: '🔍' },
    { href: `/dashboard/${siteId}/pages`, label: 'Pages', icon: '📄' },
    { href: `/dashboard/${siteId}/products`, label: 'Products', icon: '🛍️' },
    { href: `/dashboard/${siteId}/funnel`, label: 'Funnel', icon: '📈' },
    { href: `/dashboard/${siteId}/realtime`, label: 'Realtime', icon: '⚡' },
    { href: `/dashboard/${siteId}/bots`, label: 'Bots', icon: '🤖' },
  ]

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-6 overflow-x-auto whitespace-nowrap pb-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium ${
                    pathname === item.href
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
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
