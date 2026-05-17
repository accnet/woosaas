import { api } from '@/lib/api'

const ADMIN_TOKEN_KEY = 'woosaas-admin-token'

export interface AdminUserRow {
  id: string
  email: string
  name: string
  status: string
  plan_id: string
  created_at: string
}

export interface AdminPlan {
  id: string
  name: string
  price_cents: number
  interval: string
  event_limit: number
  site_limit: number
  tracking_order_limit: number
  features: string
}

export interface AdminAuditLog {
  id: string
  admin_id: string | null
  action: string
  target_type: string
  target_id: string | null
  reason: string
  created_at: string
}

export interface AdminTrackingProvider {
  id: string
  display_name: string
  enabled: boolean
  base_url: string
  webhook_url: string
  has_api_key: boolean
  has_webhook_secret: boolean
  supports_webhooks: boolean
  supports_refresh: boolean
  supports_register: boolean
}

export interface AdminSMTPSettings {
  enabled: boolean
  host: string
  port: number
  username: string
  from_email: string
  from_name: string
  encryption: 'none' | 'tls' | 'starttls'
  has_password: boolean
}

export function getAdminToken() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(ADMIN_TOKEN_KEY) || ''
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

function adminHeaders() {
  return { Authorization: `Bearer ${getAdminToken()}` }
}

export const adminApi = {
  login: (email: string, password: string) => api.post('/api/admin/v1/auth/login', { email, password }),
  me: () => api.get('/api/admin/v1/me', { headers: adminHeaders() }),
  users: () => api.get<{ users: AdminUserRow[] }>('/api/admin/v1/users', { headers: adminHeaders() }),
  updateUserStatus: (userId: string, status: string, reason: string) =>
    api.put(`/api/admin/v1/users/${userId}/status`, { status, reason }, { headers: adminHeaders() }),
  updateUserPlan: (userId: string, plan_id: string, reason: string) =>
    api.put(`/api/admin/v1/users/${userId}/plan`, { plan_id, reason }, { headers: adminHeaders() }),
  impersonate: (user_id: string, reason: string) =>
    api.post<{ token: string; session_id: string }>('/api/admin/v1/impersonation', { user_id, reason }, { headers: adminHeaders() }),
  plans: () => api.get<{ plans: AdminPlan[] }>('/api/admin/v1/plans', { headers: adminHeaders() }),
  updatePlan: (planId: string, data: Record<string, unknown>) =>
    api.put(`/api/admin/v1/plans/${planId}`, data, { headers: adminHeaders() }),
  auditLogs: () => api.get<{ audit_logs: AdminAuditLog[] }>('/api/admin/v1/audit-logs', { headers: adminHeaders() }),
  trackingProviders: () =>
    api.get<{ providers: AdminTrackingProvider[] }>('/api/admin/v1/tracking-providers', { headers: adminHeaders() }),
  updateTrackingProvider: (providerId: string, data: { enabled?: boolean; base_url?: string; api_key?: string; webhook_secret?: string; reason: string }) =>
    api.put(`/api/admin/v1/tracking-providers/${providerId}`, data, { headers: adminHeaders() }),
  smtpSettings: () => api.get<{ smtp: AdminSMTPSettings }>('/api/admin/v1/system-settings/smtp', { headers: adminHeaders() }),
  updateSMTPSettings: (data: Partial<AdminSMTPSettings> & { password?: string; clear_password?: boolean; reason: string }) =>
    api.put<{ smtp: AdminSMTPSettings }>('/api/admin/v1/system-settings/smtp', data, { headers: adminHeaders() }),
}
