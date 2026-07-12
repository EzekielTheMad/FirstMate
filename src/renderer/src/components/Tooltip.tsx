import { ReactNode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Lightweight hover tooltip. Wraps `children` (typically inline text) and shows
 * `content` in a bubble on hover. The bubble is rendered into `document.body`
 * via a portal with fixed positioning computed from the trigger's rect, so it
 * is never clipped by a scrolling/overflow container. Flips below the trigger
 * when there isn't room above it.
 */
export function Tooltip({
  content,
  children
}: {
  content: ReactNode
  children: ReactNode
}): JSX.Element {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)

  function show(): void {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.top < 90 // not enough room above — flip under the trigger
    setPos({
      left: r.left + r.width / 2,
      top: below ? r.bottom + 6 : r.top - 6,
      below
    })
  }

  return (
    <span
      ref={wrapRef}
      className="tooltip-wrap"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <span
            className={`tooltip-bubble ${pos.below ? 'below' : ''}`}
            role="tooltip"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              right: 'auto',
              bottom: 'auto',
              transform: pos.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  )
}
