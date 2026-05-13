import axios from 'axios'
import { clearStoredAuth, getStoredToken } from '@/lib/auth-storage'
import type {
  APIKey,
  APIKeyResponse,
  AbandonmentStats,
  AuthResponse,
  BillingProfile,
  BotReportResponse,
  CampaignStats,
  ChangePasswordInput,
  ChannelStat,
  CreateSiteMemberInput,
  CreateSiteInput,
  CrossSellPair,
  CustomerDetailResponse,
  CustomerListResponse,
  DeviceStats,
  EventResponse,
  FunnelStats,
  GeoStat,
  HeatmapCell,
  Invoice,
  OrderDetail,
  OrderListResponse,
  RefundStats,
  RetentionCohort,
  WooContactListResponse,
  WooOrderSyncState,
  OverviewStats,
  PageStats,
  PipelineHealth,
  ProductStats,
  RealtimeStats,
  RealtimeEvent,
  Site,
  SiteMember,
  SiteMembersResponse,
  SourceStats,
  TrackingCodeResponse,
  TrendPoint,
  UpdateProfileInput,
  UpdateSiteMemberInput,
  UpdateSiteInput,
  UpdateUserSettingsInput,
  User,
  UserSettings,
} from '@/lib/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = getStoredToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        clearStoredAuth()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  register: (email: string, password: string, name: string) =>
    api.post<AuthResponse>('/api/v1/auth/register', { email, password, name }),
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/api/v1/auth/login', { email, password }),
  me: () => api.get<User>('/api/v1/me'),
}

export const profileApi = {
  update: (data: UpdateProfileInput) => api.put<User>('/api/v1/me', data),
  changePassword: (data: ChangePasswordInput) => api.put('/api/v1/me/password', data),
}

export const settingsApi = {
  get: () => api.get<UserSettings>('/api/v1/settings'),
  update: (data: UpdateUserSettingsInput) => api.put<UserSettings>('/api/v1/settings', data),
}

export const billingApi = {
  getProfile: () => api.get<BillingProfile>('/api/v1/billing/profile'),
  updateProfile: (data: BillingProfile) => api.put<BillingProfile>('/api/v1/billing/profile', data),
  listInvoices: () => api.get<Invoice[]>('/api/v1/billing/invoices'),
}

// Sites API
export const sitesApi = {
  list: () => api.get<Site[]>('/api/v1/sites'),
  create: (data: CreateSiteInput) => api.post<Site>('/api/v1/sites', data),
  get: (id: string) => api.get<Site>(`/api/v1/sites/${id}`),
  update: (id: string, data: UpdateSiteInput) =>
    api.put<Site>(`/api/v1/sites/${id}`, data),
  delete: (id: string) => api.delete(`/api/v1/sites/${id}`),
  getApiKeys: (id: string) => api.get<APIKey[]>(`/api/v1/sites/${id}/api-keys`),
  createApiKey: (id: string, name: string) =>
    api.post<APIKeyResponse>(`/api/v1/sites/${id}/api-keys`, { name }),
  deleteApiKey: (siteId: string, keyId: string) =>
    api.delete(`/api/v1/sites/${siteId}/api-keys/${keyId}`),
  getMembers: (id: string) => api.get<SiteMembersResponse>(`/api/v1/sites/${id}/members`),
  addMember: (id: string, data: CreateSiteMemberInput) =>
    api.post<SiteMember>(`/api/v1/sites/${id}/members`, data),
  updateMember: (id: string, memberId: string, data: UpdateSiteMemberInput) =>
    api.put<SiteMember>(`/api/v1/sites/${id}/members/${memberId}`, data),
  deleteMember: (id: string, memberId: string) =>
    api.delete(`/api/v1/sites/${id}/members/${memberId}`),
  getTrackingCode: (id: string) =>
    api.get<TrackingCodeResponse>(`/api/v1/sites/${id}/tracking-code`),
  sendDebugEvent: (id: string, eventName: string) =>
    api.post<EventResponse>(`/api/v1/sites/${id}/debug-event`, {
      event_name: eventName,
    }),
}

import type { AxiosRequestConfig } from 'axios'

// Stats API
export const statsApi = {
  overview: (siteId: string, from: string, to: string, timezone = 'UTC', config?: AxiosRequestConfig) =>
    api.get<OverviewStats>('/api/v1/stats/overview', {
      params: { site_id: siteId, from, to, timezone },
      ...config,
    }),
  trend: (siteId: string, from: string, to: string, granularity = 'day', config?: AxiosRequestConfig) =>
    api.get<TrendPoint[]>('/api/v1/stats/trend', {
      params: { site_id: siteId, from, to, granularity },
      ...config,
    }),
  sources: (siteId: string, from: string, to: string, config?: AxiosRequestConfig) =>
    api.get<SourceStats[]>('/api/v1/stats/sources', {
      params: { site_id: siteId, from, to },
      ...config,
    }),
  campaigns: (siteId: string, from: string, to: string, config?: AxiosRequestConfig) =>
    api.get<CampaignStats[]>('/api/v1/stats/campaigns', {
      params: { site_id: siteId, from, to },
      ...config,
    }),
  pages: (siteId: string, from: string, to: string, limit = 20, config?: AxiosRequestConfig) =>
    api.get<PageStats[]>('/api/v1/stats/pages', {
      params: { site_id: siteId, from, to, limit },
      ...config,
    }),
  products: (siteId: string, from: string, to: string, limit = 20, config?: AxiosRequestConfig) =>
    api.get<ProductStats[]>('/api/v1/stats/products', {
      params: { site_id: siteId, from, to, limit },
      ...config,
    }),
  funnel: (siteId: string, from: string, to: string, config?: AxiosRequestConfig) =>
    api.get<FunnelStats>('/api/v1/stats/funnel', {
      params: { site_id: siteId, from, to },
      ...config,
    }),
  realtime: (siteId: string, minutes = 5, config?: AxiosRequestConfig) =>
    api.get<RealtimeStats>('/api/v1/stats/realtime', {
      params: { site_id: siteId, minutes },
      ...config,
    }),
  realtimeEvents: (siteId: string, minutes = 5, limit = 25, config?: AxiosRequestConfig) =>
    api.get<RealtimeEvent[]>('/api/v1/stats/realtime/events', {
      params: { site_id: siteId, minutes, limit },
      ...config,
    }),
  bots: (siteId: string, from: string, to: string, config?: AxiosRequestConfig) =>
    api.get<BotReportResponse>('/api/v1/stats/bots', {
      params: { site_id: siteId, from, to },
      ...config,
    }),
  health: (siteId: string, config?: AxiosRequestConfig) =>
    api.get<PipelineHealth>('/api/v1/stats/health', {
      params: { site_id: siteId },
      ...config,
    }),
  customers: (siteId: string, page = 1, pageSize = 25, config?: AxiosRequestConfig) =>
    api.get<CustomerListResponse>('/api/v1/stats/customers', {
      params: { site_id: siteId, page, page_size: pageSize },
      ...config,
    }),
  customer: (siteId: string, clientId: string, limit = 50) =>
    api.get<CustomerDetailResponse>(`/api/v1/stats/customers/${encodeURIComponent(clientId)}`, {
      params: { site_id: siteId, limit },
    }),
  exportUrl: (siteId: string, type: 'events' | 'orders' | 'customers', from: string, to: string) => {
    const params = new URLSearchParams({ site_id: siteId, type, from, to })
    return `${API_URL}/api/v1/stats/export?${params.toString()}`
  },
  devices: (siteId: string, from: string, to: string, config?: AxiosRequestConfig) =>
    api.get<DeviceStats>('/api/v1/stats/devices', {
      params: { site_id: siteId, from, to },
      ...config,
    }),
  geo: (siteId: string, from: string, to: string, config?: AxiosRequestConfig) =>
    api.get<GeoStat[]>('/api/v1/stats/geo', {
      params: { site_id: siteId, from, to },
      ...config,
    }),
  abandonment: (siteId: string, from: string, to: string, config?: AxiosRequestConfig) =>
    api.get<AbandonmentStats>('/api/v1/stats/abandonment', {
      params: { site_id: siteId, from, to },
      ...config,
    }),
  heatmap: (siteId: string, from: string, to: string, metric = 'sessions', config?: AxiosRequestConfig) =>
    api.get<HeatmapCell[]>('/api/v1/stats/heatmap', {
      params: { site_id: siteId, from, to, metric },
      ...config,
    }),
  channels: (siteId: string, from: string, to: string, config?: AxiosRequestConfig) =>
    api.get<ChannelStat[]>('/api/v1/stats/channels', {
      params: { site_id: siteId, from, to },
      ...config,
    }),
}

export const ordersApi = {
  list: (siteId: string, page = 1, pageSize = 25, params?: {
    q?: string
    payment_status?: string
    fulfillment_status?: string
    date_from?: string
    date_to?: string
  }) =>
    api.get<OrderListResponse>('/api/v1/orders', {
      params: { site_id: siteId, page, page_size: pageSize, ...(params || {}) },
    }),
  detail: (siteId: string, wooOrderId: string) =>
    api.get<OrderDetail>(`/api/v1/orders/${encodeURIComponent(wooOrderId)}`, {
      params: { site_id: siteId },
    }),
  listContacts: (siteId: string, page = 1, pageSize = 25, q?: string) =>
    api.get<WooContactListResponse>('/api/v1/contacts', {
      params: { site_id: siteId, page, page_size: pageSize, ...(q ? { q } : {}) },
    }),
  syncState: (siteId: string) =>
    api.get<WooOrderSyncState>(`/api/v1/sites/${siteId}/orders/sync-state`),
  retention: (siteId: string) =>
    api.get<RetentionCohort[]>('/api/v1/orders/retention', {
      params: { site_id: siteId },
    }),
  refunds: (siteId: string, from: string, to: string) =>
    api.get<RefundStats>('/api/v1/orders/refunds', {
      params: { site_id: siteId, from, to },
    }),
  crossSell: (siteId: string, limit = 20) =>
    api.get<CrossSellPair[]>('/api/v1/orders/cross-sell', {
      params: { site_id: siteId, limit },
    }),
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || fallback
  }

  return fallback
}
