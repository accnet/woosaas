import {
  Activity,
  Bot,
  ChartColumn,
  CreditCard,
  Download,
  FileText,
  Globe2,
  House,
  Globe,
  HeartPulse,
  Layers2,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  LockKeyhole,
  Mail,
  MapPin,
  Megaphone,
  Monitor,
  Package,
  PanelLeft,
  PlugZap,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  ShoppingCart,
  Settings2,
  TableProperties,
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
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/sites', label: 'Websites', icon: Globe },
]

export const settingsRootNav: NavItem[] = [
  { href: '/dashboard/settings/general', label: 'Setting', icon: Settings2 },
]

export const settingsNav: NavItem[] = [
  { href: '/dashboard/settings/general', label: 'General', icon: Settings2 },
  { href: '/dashboard/settings/authentication', label: 'Authentication', icon: LockKeyhole },
  { href: '/dashboard/settings/billing', label: 'Billing Information', icon: CreditCard },
  { href: '/dashboard/settings/invoices', label: 'Invoices', icon: FileText },
  { href: '/dashboard/settings/export-templates', label: 'Export Templates', icon: TableProperties },
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
  { href: 'integrations', label: 'Integrations', icon: PlugZap },
]

export const siteSetupNav: NavItem[] = [
  { href: '/dashboard/sites/[siteId]/onboarding', label: 'Setup', icon: Settings2 },
]

export function getCurrentSiteId(pathname: string) {
  const analyticsMatch = pathname.match(/^\/dashboard\/([^/]+)\//)
  if (analyticsMatch?.[1] && !['sites', 'settings', 'teams'].includes(analyticsMatch[1])) {
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
  return /^\/dashboard\/(?!sites\/|settings\/|teams(?:\/|$))[^/]+\//.test(pathname)
}

export function isSettingsRoute(pathname: string) {
  return pathname === '/dashboard/settings' || pathname.startsWith('/dashboard/settings/')
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
      title: 'Dashboard',
      description: 'Track website readiness, app adoption, and operational priorities across your sites.',
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
      description: 'Invite system members and manage assigned permissions.',
    }
  }

  if (pathname === '/dashboard/settings/general') {
    return {
      title: 'General',
      description: 'Manage user defaults used across your dashboard and new websites.',
    }
  }

  if (pathname === '/dashboard/settings/authentication') {
    return {
      title: 'Authentication',
      description: 'Manage your profile and password.',
    }
  }

  if (pathname === '/dashboard/settings/billing') {
    return {
      title: 'Billing Information',
      description: 'Manage billing contact and address details.',
    }
  }

  if (pathname === '/dashboard/settings/invoices') {
    return {
      title: 'Invoices',
      description: 'Review invoice history for your account.',
    }
  }

  if (pathname.startsWith('/dashboard/settings/export-templates')) {
    return {
      title: 'Export Templates',
      description: 'Create and manage CSV column templates for order exports.',
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
