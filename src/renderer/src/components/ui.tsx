import { ReactNode, useEffect, useState } from 'react'

export function Panel({
  title,
  children,
  actions
}: {
  title?: string
  children: ReactNode
  actions?: ReactNode
}): JSX.Element {
  return (
    <div className="panel">
      {title && (
        <div className="panel-title">
          <span>{title}</span>
          <span className="line" />
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'accent' | 'amber' | 'green'
}): JSX.Element {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Loader({ label }: { label?: string }): JSX.Element {
  return (
    <div className="center-msg">
      <div className="spinner" />
      <div className="dim">{label ?? 'Loading…'}</div>
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }): JSX.Element {
  return (
    <div className="error-box">
      <div>{message}</div>
      {onRetry && (
        <div style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

/** Renders "Updated Ns ago" for a given epoch-ms timestamp, ticking every second. */
export function UpdatedAgo({ at }: { at?: number }): JSX.Element | null {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!at) return undefined
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [at])

  if (!at) return null

  const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
  let label: string
  if (secs < 5) label = 'just now'
  else if (secs < 60) label = `${secs}s ago`
  else if (secs < 3600) label = `${Math.round(secs / 60)}m ago`
  else label = `${Math.round(secs / 3600)}h ago`

  return (
    <span className="dim" style={{ fontSize: 11 }}>
      {label === 'just now' ? 'Updated just now' : `Updated ${label}`}
    </span>
  )
}

export function EmptyState({
  title,
  children
}: {
  title: string
  children?: ReactNode
}): JSX.Element {
  return (
    <div className="center-msg">
      <h2>{title}</h2>
      {children && <div className="dim">{children}</div>}
    </div>
  )
}
