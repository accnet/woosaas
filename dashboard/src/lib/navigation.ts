import {
  Activity,
  Bot,
  ChartColumn,
  Download,
  Globe2,
  House,
  Globe,
  HeartPulse,
  KeyRound,
  Layers2,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  Mail,
  MapPin,
  Megaphone,
  Monitor,
  Package,
  PanelLeft,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  ShoppingCart,
  Settings2,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  status?: 'comingSoon'
}

export const appNav: NavItem[] = [
  { href: '/dashboard', label: 'Workspace', icon: LayoutDashboard },
  { href: '/dashboard/sites', label: 'Websites', icon: Globe },
]

export const settingsRootNav: NavItem[] = [
  { href: '/dashboard/teams', label: 'Setting', icon: Settings2 },
]

export const settingsNav: NavItem[] = [
  { href: '/dashboard/teams', label: 'Teams', icon: Users },
]

export const siteAppsNav: NavItem[] = [
  { href: '/dashboard/sites/[siteId]', label: 'Home', icon: House },
  { href: '/dashboard/[siteId]/overview', label: 'Analytics', icon: ChartColumn },
  { href: '/dashboard/[siteId]/orders', label: 'Orders', icon: ReceiptText },
  { href: '/dashboard/[siteId]/contacts', label: 'Contacts', icon: Users },
  { href: '/dashboard/sites/[siteId]/support-tickets', label: 'Support Tickets', icon: LifeBuoy, status: 'comingSoon' },
  { href: '/dashboard/sites/[siteId]/email-campaigns', label: 'Email Campaigns', icon: Mail, status: 'comingSoon' },
]

export const siteAnalyticsNav: NavItem[] = [
  { href: 'overview', label: 'Overview', icon: ChartColumn },
  { href: 'trend', label: 'Growth', icon: LineChart },
  { href: 'devices', label: 'Devices', icon: Monitor },
  { href: 'geo', label: 'Geography', icon: Globe2 },
]

export const siteAcquisitionNav: NavItem[] = [
  { href: 'sources', label: 'Sources', icon: Target },
  { href: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { href: 'channels', label: 'Channels', icon: Layers2 },
]

export const siteCommerceNav: NavItem[] = [
  { href: 'revenue', label: 'Revenue', icon: TrendingUp },
  { href: 'pages', label: 'Pages', icon: PanelLeft },
  { href: 'products', label: 'Products', icon: Package },
  { href: 'funnel', label: 'Funnel', icon: ShoppingCart },
  { href: 'abandonment', label: 'Abandonment', icon: MapPin },
  { href: 'heatmap', label: 'Time Heatmap', icon: Target },
  { href: 'retention', label: 'Retention', icon: RefreshCcw },
  { href: 'refunds', label: 'Refunds', icon: RotateCcw },
]

export const siteOperationsNav: NavItem[] = [
  { href: 'realtime', label: 'Realtime', icon: Activity },
  { href: 'bots', label: 'Bots', icon: Bot },
  { href: 'exports', label: 'Exports', icon: Download },
  { href: 'health', label: 'Health', icon: HeartPulse },
]

export const siteSetupNav: NavItem[] = [
  { href: '/dashboard/sites/[siteId]/onboarding', label: 'Onboarding', icon: PanelLeft },
  { href: '/dashboard/sites/[siteId]/api-keys', label: 'API Keys', icon: KeyRound },
]

export function getCurrentSiteId(pathname: string) {
  const analyticsMatch = pathname.match(/^\/dashboard\/([^/]+)\//)
  if (analyticsMatch?.[1] && analyticsMatch[1] !== 'sites') {
    return analyticsMatch[1]
  }

  const setupMatch = pathname.match(/^\/dashboard\/sites\/([^/]+)(?:\/|$)/)
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

export function isSiteWorkspaceRoute(pathname: string) {
  return /^\/dashboard\/sites\/[^/]+(?:\/|$)/.test(pathname)
}

export function isAnalyticsRoute(pathname: string) {
  return /^\/dashboard\/(?!sites\/)[^/]+\//.test(pathname)
}

export function isSettingsRoute(pathname: string) {
  return pathname === '/dashboard/teams'
}

export function getCurrentSiteApp(pathname: string) {
  if (isSettingsRoute(pathname)) {
    return 'Setting'
  }

  if (/^\/dashboard\/sites\/[^/]+\/support-tickets(?:\/|$)/.test(pathname)) {
    return 'Support Tickets'
  }

  if (/^\/dashboard\/sites\/[^/]+\/email-campaigns(?:\/|$)/.test(pathname)) {
    return 'Email Campaigns'
  }

  if (/^\/dashboard\/sites\/[^/]+(?:\/|$)/.test(pathname)) {
    return 'Website Home'
  }

  if (/^\/dashboard\/(?!sites\/)[^/]+\/orders(?:\/|$)/.test(pathname)) {
    return 'Orders'
  }

  if (/^\/dashboard\/(?!sites\/)[^/]+\/contacts(?:\/|$)/.test(pathname)) {
    return 'Contacts'
  }

  if (/^\/dashboard\/(?!sites\/)[^/]+\/.+/.test(pathname)) {
    return 'Analytics'
  }

  return null
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
  if (isSiteWorkspaceRoute(pathname)) {
    const match = pathname.match(/^\/dashboard\/sites\/[^/]+(\/.*)?$/)
    const suffix = match?.[1] || ''
    return `/dashboard/sites/${nextSiteId}${suffix}`
  }

  if (isAnalyticsRoute(pathname)) {
    const match = pathname.match(/^\/dashboard\/[^/]+(\/.*)?$/)
    const suffix = match?.[1] || '/overview'
    return `/dashboard/${nextSiteId}${suffix}`
  }

  return `/dashboard/sites/${nextSiteId}`
}

export function buildPageMeta(pathname: string) {
  if (pathname === '/dashboard') {
    return {
      title: 'Workspace',
      description: 'Track website readiness, app adoption, and operational priorities across the workspace.',
    }
  }

  if (pathname === '/dashboard/sites') {
    return {
      title: 'Websites',
      description: 'Create websites, inspect readiness, and jump into apps or setup flows.',
    }
  }

  if (pathname === '/dashboard/teams') {
    return {
      title: 'Teams',
      description: 'Manage workspace members, website access, and assigned roles.',
    }
  }

  if (/^\/dashboard\/sites\/[^/]+$/.test(pathname)) {
    return {
      title: 'Website Home',
      description: 'Manage this website and enter the apps that run on top of it.',
    }
  }

  if (pathname.includes('/support-tickets')) {
    return {
      title: 'Support Tickets',
      description: 'Coming soon ticketing workspace for this website.',
    }
  }

  if (pathname.includes('/email-campaigns')) {
    return {
      title: 'Email Campaigns',
      description: 'Coming soon campaign workspace for this website.',
    }
  }

  if (/^\/dashboard\/[^/]+\/orders(?:\/|$)/.test(pathname)) {
    return {
      title: 'Orders',
      description: 'Canonical commerce order workspace for this website.',
    }
  }

  if (/^\/dashboard\/[^/]+\/contacts(?:\/|$)/.test(pathname)) {
    return {
      title: 'Contacts',
      description: 'Customer and contact workspace for this website.',
    }
  }

  const setupSection = siteSetupNav.find((item) => pathname.endsWith(item.href.split('/').pop() || ''))
  if (setupSection) {
    return {
      title: setupSection.label,
      description: `Operational setup view for ${setupSection.label.toLowerCase()}.`,
    }
  }

  const analyticsSection = [...siteAnalyticsNav, ...siteAcquisitionNav, ...siteCommerceNav, ...siteOperationsNav].find((item) =>
    pathname.includes(`/${item.href}`)
  )
  if (analyticsSection) {
    return {
      title: analyticsSection.label,
      description: `Analytics workspace for ${analyticsSection.label.toLowerCase()}.`,
    }
  }

  return {
    title: 'Dashboard',
    description: 'Analytics and operations workspace.',
  }
}
