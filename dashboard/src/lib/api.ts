import axios from 'axios'
import { clearStoredAuth, getStoredToken } from '@/lib/auth-storage'
import type {
  APIKey,
  APIKeyResponse,
  AuthResponse,
  BotReportResponse,
  CampaignStats,
  CreateSiteMemberInput,
  CreateSiteInput,
  CustomerDetailResponse,
  CustomerListResponse,
  EventResponse,
  FunnelStats,
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
  UpdateSiteMemberInput,
  UpdateSiteInput,
  User,
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

// Stats API
export const statsApi = {
  overview: (siteId: string, from: string, to: string, timezone = 'UTC') =>
    api.get<OverviewStats>('/api/v1/stats/overview', {
      params: { site_id: siteId, from, to, timezone },
    }),
  trend: (siteId: string, from: string, to: string, granularity = 'day') =>
    api.get<TrendPoint[]>('/api/v1/stats/trend', {
      params: { site_id: siteId, from, to, granularity },
    }),
  sources: (siteId: string, from: string, to: string) =>
    api.get<SourceStats[]>('/api/v1/stats/sources', {
      params: { site_id: siteId, from, to },
    }),
  campaigns: (siteId: string, from: string, to: string) =>
    api.get<CampaignStats[]>('/api/v1/stats/campaigns', {
      params: { site_id: siteId, from, to },
    }),
  pages: (siteId: string, from: string, to: string, limit = 20) =>
    api.get<PageStats[]>('/api/v1/stats/pages', {
      params: { site_id: siteId, from, to, limit },
    }),
  products: (siteId: string, from: string, to: string, limit = 20) =>
    api.get<ProductStats[]>('/api/v1/stats/products', {
      params: { site_id: siteId, from, to, limit },
    }),
  funnel: (siteId: string, from: string, to: string) =>
    api.get<FunnelStats>('/api/v1/stats/funnel', {
      params: { site_id: siteId, from, to },
    }),
  realtime: (siteId: string, minutes = 5) =>
    api.get<RealtimeStats>('/api/v1/stats/realtime', {
      params: { site_id: siteId, minutes },
    }),
  realtimeEvents: (siteId: string, minutes = 5, limit = 25) =>
    api.get<RealtimeEvent[]>('/api/v1/stats/realtime/events', {
      params: { site_id: siteId, minutes, limit },
    }),
  bots: (siteId: string, from: string, to: string) =>
    api.get<BotReportResponse>('/api/v1/stats/bots', {
      params: { site_id: siteId, from, to },
    }),
  health: (siteId: string) =>
    api.get<PipelineHealth>('/api/v1/stats/health', {
      params: { site_id: siteId },
    }),
  customers: (siteId: string, page = 1, pageSize = 25) =>
    api.get<CustomerListResponse>('/api/v1/stats/customers', {
      params: { site_id: siteId, page, page_size: pageSize },
    }),
  customer: (siteId: string, clientId: string, limit = 50) =>
    api.get<CustomerDetailResponse>(`/api/v1/stats/customers/${encodeURIComponent(clientId)}`, {
      params: { site_id: siteId, limit },
    }),
  exportUrl: (siteId: string, type: 'events' | 'orders' | 'customers', from: string, to: string) => {
    const params = new URLSearchParams({ site_id: siteId, type, from, to })
    return `${API_URL}/api/v1/stats/export?${params.toString()}`
  },
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || fallback
  }

  return fallback
}
