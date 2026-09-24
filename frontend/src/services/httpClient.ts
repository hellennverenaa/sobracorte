/// <reference types="vite/client" />
import { buildRefreshedSessionUser } from './interceptors/sessionRefresh'
import { decodeJwtPayload } from './decodeJwtPayload'

export type RequestConfig = {
  headers?: Record<string, string>
  params?: Record<string, unknown> | URLSearchParams
  responseType?: 'json' | 'blob'
  _retry?: boolean
}

export type HttpResponse<T = unknown> = {
  data: T
  status: number
  headers: Headers
  config: RequestConfig & { url: string; method: string }
}

export class HttpError extends Error {
  response: HttpResponse
  config: HttpResponse['config']
  code?: string

  constructor(message: string, response: HttpResponse) {
    super(message)
    this.name = 'HttpError'
    this.response = response
    this.config = response.config
  }
}

export type HttpClient = {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<HttpResponse<T>>
  post<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<HttpResponse<T>>
  put<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<HttpResponse<T>>
  patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<HttpResponse<T>>
  delete<T = unknown>(url: string, config?: RequestConfig): Promise<HttpResponse<T>>
}

let refreshPromise: Promise<void> | null = null
let sessionRefreshHandler: ((user: any) => void) | null = null

export function setSessionRefreshHandler(handler: (user: any) => void) {
  sessionRefreshHandler = handler
}

function getStoredUser() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

function addSessionHeaders(headers: Headers) {
  const user = getStoredUser()
  if (!user) return
  if (user.token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${user.token}`)
  if (user.unit?.code && !headers.has('X-Dass-Unit')) headers.set('X-Dass-Unit', user.unit.code)
}

function resolveUrl(baseURL: string | undefined, path: string, params?: RequestConfig['params']) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const [pathName, query] = path.split('?')
  const url = new URL(baseURL || origin, origin)
  if (/^https?:\/\//i.test(path)) {
    url.href = path
  } else {
    const basePath = url.pathname.replace(/\/+$/, '')
    url.pathname = `${basePath}/${pathName.replace(/^\/+/, '')}`
    url.search = query ? `?${query}` : ''
  }
  if (params) {
    const entries = params instanceof URLSearchParams
      ? params.entries()
      : Object.entries(params).flatMap(([key, value]) => Array.isArray(value)
        ? value.map((item) => [key, item] as const)
        : [[key, value] as const])
    for (const [key, value] of entries) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.append(key, String(value))
    }
  }
  return url.toString()
}

async function readResponse(response: Response, responseType: RequestConfig['responseType']) {
  if (responseType === 'blob') return response.blob()
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function errorMessage(data: unknown, statusText: string, status: number) {
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (typeof payload.message === 'string') return payload.message
    if (typeof payload.error === 'string') return payload.error
  }
  return statusText || `Request failed with status code ${status}`
}

function shouldSkipRefresh(path: string) {
  return ['/auth/login', '/auth/me', '/auth/check-user'].some((route) => path.includes(route))
}

async function refreshSession(authApi: HttpClient, api: HttpClient) {
  const response = await authApi.post('/auth/me', null)
  const newToken = (response.data as any)?.data?.token
  const user = getStoredUser()
  if (!newToken || !user) throw new Error('Não foi possível renovar a sessão.')

  const synced = await api.post('/auth/check-user', null, {
    headers: { Authorization: `Bearer ${newToken}`, 'X-Dass-Unit': user.unit?.code || '' },
    _retry: true,
  })
  const syncedData = synced.data as any
  const refreshedUser = buildRefreshedSessionUser({
    user,
    token: newToken,
    tokenPayload: decodeJwtPayload(newToken),
    synced: syncedData,
  })
  localStorage.setItem('user', JSON.stringify(refreshedUser))
  sessionRefreshHandler?.(refreshedUser)
  if (typeof sessionStorage !== 'undefined' && (response.data as any)?.tokenExpirationTime) {
    sessionStorage.setItem('expirationTime', (response.data as any).tokenExpirationTime)
  }
}

export function refreshAuthSession() {
  if (!refreshPromise) refreshPromise = refreshSession(authApi, api).finally(() => { refreshPromise = null })
  return refreshPromise
}

function createClient(baseURL: string | undefined, options: { refreshOn401: boolean; authApi?: HttpClient } = { refreshOn401: false }): HttpClient {
  const client = {} as HttpClient

  const request = async <T = unknown>(url: string, config: RequestConfig & { method?: string; data?: unknown } = {}): Promise<HttpResponse<T>> => {
    const method = (config.method || 'GET').toUpperCase()
    const fullUrl = resolveUrl(baseURL, url, config.params)
    const headers = new Headers(config.headers || {})
    if (options.refreshOn401) addSessionHeaders(headers)

    let body: BodyInit | undefined
    if (config.data !== undefined && config.data !== null) {
      if (config.data instanceof FormData || config.data instanceof Blob || typeof config.data === 'string' || config.data instanceof ArrayBuffer) {
        body = config.data as BodyInit
      } else {
        body = JSON.stringify(config.data)
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      }
    }

    let response: Response
    try {
      response = await fetch(fullUrl, { method, headers, body, credentials: 'include' })
    } catch (error) {
      const networkError = error instanceof Error ? error : new Error('Network Error')
      ;(networkError as any).code = 'ERR_NETWORK'
      throw networkError
    }

    const result: HttpResponse<T> = {
      data: await readResponse(response, config.responseType) as T,
      status: response.status,
      headers: response.headers,
      config: { ...config, url, method },
    }
    if (response.ok) return result

    const error = new HttpError(errorMessage(result.data, response.statusText, response.status), result)
    if (options.refreshOn401 && response.status === 401 && !config._retry && !shouldSkipRefresh(url) && getStoredUser() && options.authApi) {
      try {
        await refreshAuthSession()
        const retryHeaders = new Headers(config.headers || {})
        const refreshedUser = getStoredUser()
        if (refreshedUser?.token) retryHeaders.set('Authorization', `Bearer ${refreshedUser.token}`)
        return request<T>(url, { ...config, headers: Object.fromEntries(retryHeaders.entries()), _retry: true })
      } catch (refreshError) {
        localStorage.removeItem('user')
        sessionStorage.removeItem('expirationTime')
        if (typeof window !== 'undefined') window.location.reload()
        throw refreshError
      }
    }
    throw error
  }

  client.get = (url, config) => request(url, { ...config, method: 'GET' })
  client.post = (url, data, config) => request(url, { ...config, method: 'POST', data })
  client.put = (url, data, config) => request(url, { ...config, method: 'PUT', data })
  client.patch = (url, data, config) => request(url, { ...config, method: 'PATCH', data })
  client.delete = (url, config) => request(url, { ...config, method: 'DELETE' })
  return client
}

export const authApi = createClient(import.meta.env.VITE_AUTH_API_URL)
export const api = createClient(import.meta.env.VITE_SOBRACORTE_API_URL, { refreshOn401: true, authApi })
