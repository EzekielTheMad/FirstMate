import { ReactNode, useState } from 'react'

/**
 * Lightweight hover tooltip. Wraps `children` (typically inline text) and
 * shows `content` in an absolutely-positioned bubble above it on hover.
 * No portals/libs — good enough for short, single-line triggers inside
 * scroll-list rows.
 */
export function Tooltip({
  content,
  children
}: {
  content: ReactNode
  children: ReactNode
}): JSX.Element {
  const [visible, setVisible] = useState(false)

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className="tooltip-bubble" role="tooltip">
          {content}
        </span>
      )}
    </span>
  )
}
