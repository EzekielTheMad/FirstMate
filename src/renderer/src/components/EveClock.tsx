import { useEffect, useState } from 'react'

function formatUtc(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** Small top-bar clock showing the current UTC time, labeled "EVE". Pure renderer, no ESI. */
export function EveClock(): JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="eve-clock" title="EVE (UTC) time">
      <span className="eve-clock-label">EVE</span>
      <span className="eve-clock-time mono">{formatUtc(now)}</span>
    </div>
  )
}
