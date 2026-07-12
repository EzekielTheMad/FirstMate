import { ReactNode } from 'react'

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
