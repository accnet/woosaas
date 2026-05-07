import {
  Activity,
  Bot,
  ChartColumn,
  Download,
  Globe,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Package,
  PanelLeft,
  Settings2,
  ShoppingCart,
  Target,
  Users,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export const appNav: NavItem[] = [
  { href: '/dashboard', label: 'Portfolio', icon: LayoutDashboard },
  { href: '/dashboard/sites', label: 'Sites', icon: Globe },
  { href: '/dashboard/[siteId]/overview', label: 'Analytics', icon: ChartColumn },
  { href: '/dashboard/sites', label: 'Settings', icon: Settings2 },
]

export const siteAnalyticsNav: NavItem[] = [
  { href: 'overview', label: 'Overview', icon: ChartColumn },
  { href: 'trend', label: 'Trend', icon: LineChart },
  { href: 'sources', label: 'Sources', icon: Target },
  { href: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { href: 'pages', label: 'Pages', icon: PanelLeft },
  { href: 'products', label: 'Products', icon: Package },
  { href: 'funnel', label: 'Funnel', icon: ShoppingCart },
]

export const siteOperationsNav: NavItem[] = [
  { href: 'realtime', label: 'Realtime', icon: Activity },
  { href: 'customers', label: 'Customers', icon: Users },
  { href: 'bots', label: 'Bots', icon: Bot },
  { href: 'exports', label: 'Exports', icon: Download },
  { href: 'health', label: 'Health', icon: HeartPulse },
]

export const siteSetupNav: NavItem[] = [
  { href: '/dashboard/sites/[siteId]/onboarding', label: 'Onboarding', icon: PanelLeft },
  { href: '/dashboard/sites/[siteId]/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/dashboard/sites/[siteId]/team', label: 'Team', icon: Users },
]

export function getCurrentSiteId(pathname: string) {
  const analyticsMatch = pathname.match(/^\/dashboard\/([^/]+)\//)
  if (analyticsMatch?.[1] && analyticsMatch[1] !== 'sites') {
    return analyticsMatch[1]
  }

  const setupMatch = pathname.match(/^\/dashboard\/sites\/([^/]+)\//)
  if (setupMatch?.[1]) {
    return setupMatch[1]
  }

  return null
}

export function getCurrentSiteSection(pathname: string) {
  const analyticsMatch = pathname.match(/^\/dashboard\/[^/]+\/([^/]+)/)
  if (analyticsMatch?.[1] && analyticsMatch[1] !== 'sites') {
    return analyticsMatch[1]
  }

  const setupMatch = pathname.match(/^\/dashboard\/sites\/[^/]+\/([^/]+)/)
  if (setupMatch?.[1]) {
    return setupMatch[1]
  }

  return null
}

export function isSiteSetupRoute(pathname: string) {
  return /^\/dashboard\/sites\/[^/]+\//.test(pathname)
}

export function buildAnalyticsHref(siteId: string, section: string) {
  return `/dashboard/${siteId}/${section}`
}

export function buildSetupHref(siteId: string, href: string) {
  return href.replace('[siteId]', siteId)
}

export function getAppHref(href: string, siteId: string | null) {
  if (href.includes('[siteId]')) {
    return siteId ? href.replace('[siteId]', siteId) : '/dashboard/sites'
  }

  return href
}

export function resolveSiteRoute(pathname: string, nextSiteId: string) {
  const section = getCurrentSiteSection(pathname)
  if (!section) {
    return `/dashboard/${nextSiteId}/overview`
  }

  if (isSiteSetupRoute(pathname)) {
    return buildSetupHref(nextSiteId, `/dashboard/sites/[siteId]/${section}`)
  }

  return buildAnalyticsHref(nextSiteId, section)
}

export function buildPageMeta(pathname: string) {
  if (pathname === '/dashboard') {
    return {
      title: 'Portfolio',
      description: 'Track rollout status, site readiness, and recent activity across stores.',
    }
  }

  if (pathname === '/dashboard/sites') {
    return {
      title: 'Site Registry',
      description: 'Create stores, inspect readiness, and manage connected websites.',
    }
  }

  const setupSection = siteSetupNav.find((item) => pathname.endsWith(item.href.split('/').pop() || ''))
  if (setupSection) {
    return {
      title: setupSection.label,
      description: `Operational setup view for ${setupSection.label.toLowerCase()}.`,
    }
  }

  const analyticsSection = [...siteAnalyticsNav, ...siteOperationsNav].find((item) =>
    pathname.includes(`/${item.href}`)
  )
  if (analyticsSection) {
    return {
      title: analyticsSection.label,
      description: `Operational analytics view for ${analyticsSection.label.toLowerCase()}.`,
    }
  }

  return {
    title: 'Dashboard',
    description: 'Analytics and operations workspace.',
  }
}
