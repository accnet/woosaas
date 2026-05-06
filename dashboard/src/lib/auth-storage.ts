const AUTH_STORAGE_KEY = 'woosaas-auth'
const LEGACY_TOKEN_STORAGE_KEY = 'token'

interface PersistedAuthState {
  state?: {
    token?: string | null
  }
}

export function getStoredToken() {
  if (typeof window === 'undefined') {
    return null
  }

  const persisted = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (persisted) {
    try {
      const parsed = JSON.parse(persisted) as PersistedAuthState
      if (parsed.state) {
        return parsed.state.token ?? null
      }
    } catch {
      // Ignore malformed persisted state and fall back to legacy storage.
    }
  }

  return window.localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY)
}

export function clearStoredAuth() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  window.localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY)
}
