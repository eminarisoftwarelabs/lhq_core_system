import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiFetch', () => {
  let apiFetch
  let ApiError
  let setAuthFailureHandler
  let tokenStorage

  beforeEach(async () => {
    vi.resetModules()
    window.localStorage.clear()
    tokenStorage = await import('./tokenStorage')
    const clientModule = await import('./apiClient')
    apiFetch = clientModule.apiFetch
    ApiError = clientModule.ApiError
    setAuthFailureHandler = clientModule.setAuthFailureHandler
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('attaches the Authorization header on an authenticated request', async () => {
    tokenStorage.setTokens({ access: 'access-1', refresh: 'refresh-1' })
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }))

    await apiFetch('/me/')

    const [, options] = globalThis.fetch.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer access-1')
  })

  it('does not attach an Authorization header on login', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse(200, { access: 'a', refresh: 'r', user: { id: 1 } }),
    )

    await apiFetch('/auth/login/', {
      method: 'POST',
      body: { email: 'a@b.com', password: 'x' },
      skipAuth: true,
    })

    const [, options] = globalThis.fetch.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('on a 401, refreshes once and retries the original request', async () => {
    tokenStorage.setTokens({ access: 'expired', refresh: 'refresh-1' })
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' })) // original request
      .mockResolvedValueOnce(jsonResponse(200, { access: 'new-access', refresh: 'new-refresh' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { id: 1 })) // retried request

    const result = await apiFetch('/me/')

    expect(result).toEqual({ id: 1 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    expect(tokenStorage.getAccessToken()).toBe('new-access')
    expect(tokenStorage.getRefreshToken()).toBe('new-refresh')

    const retryCall = globalThis.fetch.mock.calls[2]
    expect(retryCall[1].headers.Authorization).toBe('Bearer new-access')
  })

  it('clears tokens and reports auth failure when the refresh call itself fails', async () => {
    tokenStorage.setTokens({ access: 'expired', refresh: 'blacklisted' })
    const onFailure = vi.fn()
    setAuthFailureHandler(onFailure)

    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' })) // original request
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Token is blacklisted', code: 'token_not_valid' })) // refresh fails

    await expect(apiFetch('/me/')).rejects.toBeInstanceOf(ApiError)

    expect(tokenStorage.getAccessToken()).toBeNull()
    expect(tokenStorage.getRefreshToken()).toBeNull()
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it('clears tokens if the retried request still 401s after a successful refresh', async () => {
    tokenStorage.setTokens({ access: 'expired', refresh: 'refresh-1' })
    const onFailure = vi.fn()
    setAuthFailureHandler(onFailure)

    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { access: 'new-access', refresh: 'new-refresh' }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'still unauthorized' }))

    await expect(apiFetch('/me/')).rejects.toBeInstanceOf(ApiError)
    expect(tokenStorage.getAccessToken()).toBeNull()
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent refreshes into a single refresh call', async () => {
    tokenStorage.setTokens({ access: 'expired', refresh: 'refresh-1' })
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' })) // request A
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' })) // request B
      .mockResolvedValueOnce(jsonResponse(200, { access: 'new-access', refresh: 'new-refresh' })) // single refresh
      .mockResolvedValueOnce(jsonResponse(200, { id: 1 })) // retry A
      .mockResolvedValueOnce(jsonResponse(200, { id: 2 })) // retry B

    const [a, b] = await Promise.all([apiFetch('/me/'), apiFetch('/users/')])

    expect(a).toEqual({ id: 1 })
    expect(b).toEqual({ id: 2 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(5)

    const refreshCalls = globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/auth/token/refresh/'))
    expect(refreshCalls).toHaveLength(1)
  })

  it('throws ApiError with the response body for a non-401 error', async () => {
    tokenStorage.setTokens({ access: 'access-1', refresh: 'refresh-1' })
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(400, { email: ['Already exists.'] }))

    const error = await apiFetch('/users/create/', { method: 'POST', body: {} }).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.data).toEqual({ email: ['Already exists.'] })
  })

  it('returns null for a 204 No Content response', async () => {
    tokenStorage.setTokens({ access: 'access-1', refresh: 'refresh-1' })
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(204))

    const result = await apiFetch('/auth/logout/', { method: 'POST', body: { refresh: 'x' } })

    expect(result).toBeNull()
  })
})
