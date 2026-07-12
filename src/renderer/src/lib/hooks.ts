import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateState } from '@shared/types'

export interface AsyncState<T> {
  loading: boolean
  data?: T
  error?: string
  reload: () => void
  /** epoch ms of the last successful load, if any. */
  lastUpdatedAt?: number
}

/**
 * Run an async loader on mount, with a manual reload and unmount safety.
 * When `refreshMs` is provided and > 0, the loader is re-run on that interval
 * (cleaned up on unmount / when the interval changes).
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  refreshMs?: number
): AsyncState<T> {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>()
  const mounted = useRef(true)

  const run = useCallback(() => {
    setLoading(true)
    setError(undefined)
    loader()
      .then((d) => {
        if (mounted.current) {
          setData(d)
          setLastUpdatedAt(Date.now())
        }
      })
      .catch((e) => {
        if (mounted.current) setError(String(e))
      })
      .finally(() => {
        if (mounted.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    mounted.current = true
    run()
    return () => {
      mounted.current = false
    }
  }, [run])

  useEffect(() => {
    if (!refreshMs || refreshMs <= 0) return undefined
    const id = setInterval(run, refreshMs)
    return () => clearInterval(id)
  }, [run, refreshMs])

  return { loading, data, error, reload: run, lastUpdatedAt }
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Subscribe to update-state changes from the main process. */
export function useUpdates(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    window.firstmate.updates.getState().then(setState)
    const off = window.firstmate.updates.onChange(setState)
    return off
  }, [])
  return state
}
