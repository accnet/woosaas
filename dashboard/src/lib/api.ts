import axios from 'axios'

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
        localStorage.removeItem('token')
        localStorage.removeItem('woosaas-auth')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  register: (email: string, password: string, name: string) =>
    api.post('/api/v1/auth/register', { email, password, name }),
  login: (email: string, password: string) =>
    api.post('/api/v1/auth/login', { email, password }),
  me: () => api.get('/api/v1/me'),
}

function getStoredToken() {
  const directToken = localStorage.getItem('token')
  if (directToken) {
    return directToken
  }

  const persisted = localStorage.getItem('woosaas-auth')
  if (!persisted) {
    return null
  }

  try {
    return JSON.parse(persisted)?.state?.token || null
  } catch {
    return null
  }
}

// Sites API
export const sitesApi = {
  list: () => api.get('/api/v1/sites'),
  create: (data: { name: string; domain: string }) =>
    api.post('/api/v1/sites', data),
  get: (id: string) => api.get(`/api/v1/sites/${id}`),
  update: (id: string, data: any) => api.put(`/api/v1/sites/${id}`, data),
  delete: (id: string) => api.delete(`/api/v1/sites/${id}`),
  getApiKeys: (id: string) => api.get(`/api/v1/sites/${id}/api-keys`),
  createApiKey: (id: string, name: string) =>
    api.post(`/api/v1/sites/${id}/api-keys`, { name }),
  getTrackingCode: (id: string) =>
    api.get(`/api/v1/sites/${id}/tracking-code`),
}

// Stats API
export const statsApi = {
  overview: (siteId: string, from: string, to: string, timezone = 'UTC') =>
    api.get('/api/v1/stats/overview', {
      params: { site_id: siteId, from, to, timezone },
    }),
  trend: (siteId: string, from: string, to: string, granularity = 'day') =>
    api.get('/api/v1/stats/trend', {
      params: { site_id: siteId, from, to, granularity },
    }),
  sources: (siteId: string, from: string, to: string) =>
    api.get('/api/v1/stats/sources', {
      params: { site_id: siteId, from, to },
    }),
  pages: (siteId: string, from: string, to: string, limit = 20) =>
    api.get('/api/v1/stats/pages', {
      params: { site_id: siteId, from, to, limit },
    }),
  products: (siteId: string, from: string, to: string, limit = 20) =>
    api.get('/api/v1/stats/products', {
      params: { site_id: siteId, from, to, limit },
    }),
  funnel: (siteId: string, from: string, to: string) =>
    api.get('/api/v1/stats/funnel', {
      params: { site_id: siteId, from, to },
    }),
  realtime: (siteId: string, minutes = 5) =>
    api.get('/api/v1/stats/realtime', {
      params: { site_id: siteId, minutes },
    }),
  bots: (siteId: string, from: string, to: string) =>
    api.get('/api/v1/stats/bots', {
      params: { site_id: siteId, from, to },
    }),
}
