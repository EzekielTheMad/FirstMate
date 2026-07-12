import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  loading: boolean
  data?: T
  error?: string
  reload: () => void
}

/** Run an async loader on mount, with a manual reload and unmount safety. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const mounted = useRef(true)

  const run = useCallback(() => {
    setLoading(true)
    setError(undefined)
    loader()
      .then((d) => {
        if (mounted.current) setData(d)
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

  return { loading, data, error, reload: run }
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
