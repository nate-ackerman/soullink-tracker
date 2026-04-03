import { useState, useCallback } from 'react'

/**
 * Like useState but persists the value in sessionStorage so it survives
 * in-app navigation. Resets when the browser/app session ends.
 */
export function useSessionState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setStateRaw] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key)
      return saved !== null ? (JSON.parse(saved) as T) : initial
    } catch {
      return initial
    }
  })

  const setState = useCallback((action: React.SetStateAction<T>) => {
    setStateRaw((prev) => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action
      try { sessionStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }, [key])

  return [state, setState]
}
