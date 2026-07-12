/**
 * Tiny inline-SVG line chart. Renders nothing for fewer than two points.
 * The `width`/`height` props define the internal coordinate space (viewBox);
 * the `.sparkline` CSS class stretches the rendered SVG to fill its container.
 */
export function Sparkline({
  values,
  width = 200,
  height = 40,
  color
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}): JSX.Element | null {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)

  const points = values
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const trendColor = color ?? (values[values.length - 1] >= values[0] ? 'var(--green)' : 'var(--red)')

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Trend sparkline"
    >
      <polyline
        points={points}
        fill="none"
        stroke={trendColor}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
