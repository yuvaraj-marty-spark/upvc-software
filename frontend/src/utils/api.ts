const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
const API_BASE_URL = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '/api'

const SESSION_TOKEN_KEY = 'ls_interiors_passcode_token'
const SESSION_LABEL_KEY = 'ls_interiors_passcode_label'
const CACHED_APP_STORAGE_KEYS = [
  'ls-interiors-customers',
  'ls-interiors-saved-orders',
  'ls-interiors-project-formulas',
  'ls-interiors-customer-formulas',
  'ls-interiors-draft-formulas',
  'ls-interiors-custom-formulas',
]

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}

export function getSessionToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY)
}

export function getSessionLabel(): string | null {
  return sessionStorage.getItem(SESSION_LABEL_KEY)
}

export function setPasscodeSession(token: string, label: string): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  sessionStorage.setItem(SESSION_LABEL_KEY, label)
}

export function clearPasscodeSession(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
  sessionStorage.removeItem(SESSION_LABEL_KEY)
  try {
    for (const key of CACHED_APP_STORAGE_KEYS) {
      localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage errors
  }
}

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {})
  const token = getSessionToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers })

  if (response.status === 401 && !input.includes('/passcode/login')) {
    clearPasscodeSession()
    window.dispatchEvent(new CustomEvent('ls-passcode-expired'))
  }

  return response
}
