import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi, usersApi } from '../lib/api'
import { setAuthFailureHandler } from '../lib/apiClient'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '../lib/tokenStorage'
import { AuthContext } from './context'
import { isStaffLevel } from './permissions'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // 'loading' while we try to rehydrate from a stored token, then settles.
  const [status, setStatus] = useState('loading')

  const handleAuthFailure = useCallback(() => {
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  useEffect(() => {
    setAuthFailureHandler(handleAuthFailure)
  }, [handleAuthFailure])

  useEffect(() => {
    let cancelled = false

    async function rehydrate() {
      if (!getAccessToken() && !getRefreshToken()) {
        setStatus('unauthenticated')
        return
      }
      try {
        const me = await usersApi.me()
        if (!cancelled) {
          setUser(me)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) {
          clearTokens()
          setStatus('unauthenticated')
        }
      }
    }

    rehydrate()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password)
    setTokens({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refresh = getRefreshToken()
    try {
      if (refresh) await authApi.logout(refresh)
    } catch {
      // Clear local state regardless of whether the server call succeeded.
    } finally {
      clearTokens()
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isStaffLevel: user ? isStaffLevel(user.role) : false,
      login,
      logout,
      setUser,
    }),
    [user, status, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
