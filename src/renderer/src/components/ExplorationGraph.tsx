import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { ExplorationMap, WormholeSignature, WormholeSystem } from '@shared/types'
import { solarSystemById } from '@shared/data/exploration-static'
import { LIFE_LABELS, MASS_LABELS } from '../lib/exploration'

interface GraphNode {
  system: WormholeSystem
  x: number
  y: number
}

interface GraphEdge {
  origin: WormholeSystem
  destination: WormholeSystem
  signature: WormholeSignature
}

function graphLayout(map: ExplorationMap): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
  const systems = map.systems.filter((system) => !system.archivedAt)
  const byId = new Map(systems.map((system) => [system.id, system]))
  const adjacency = new Map<string, string[]>()
  const edges: GraphEdge[] = []
  for (const origin of systems) {
    for (const signature of origin.signatures) {
      if (signature.group !== 'wormhole' || signature.closedAt || !signature.destinationSystemId) continue
      const destination = byId.get(signature.destinationSystemId)
      if (!destination || destination.id === origin.id) continue
      edges.push({ origin, destination, signature })
      adjacency.set(origin.id, [...(adjacency.get(origin.id) ?? []), destination.id])
      adjacency.set(destination.id, [...(adjacency.get(destination.id) ?? []), origin.id])
    }
  }

  const positioned = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()
  let leaf = 0
  const place = (id: string, depth: number, parent?: string): number => {
    const existing = positioned.get(id)
    if (existing) return existing.y
    visited.add(id)
    const children = (adjacency.get(id) ?? []).filter((child) => child !== parent && !visited.has(child))
    const childYs = children.map((child) => place(child, depth + 1, id))
    const y = childYs.length ? childYs.reduce((sum, value) => sum + value, 0) / childYs.length : leaf++ * 112
    positioned.set(id, { x: depth * 205, y })
    return y
  }

  const root = byId.get(map.rootSystemId ?? '') ?? systems[0]
  if (root) place(root.id, 0)
  for (const system of systems) if (!visited.has(system.id)) place(system.id, 0)

  const nodes = systems.map((system) => {
    const automatic = positioned.get(system.id) ?? { x: 0, y: leaf++ * 112 }
    const saved = map.nodePositions?.[system.id]
    return { system, x: saved?.x ?? automatic.x, y: saved?.y ?? automatic.y }
  })
  return {
    nodes,
    edges,
    width: nodes.reduce((value, node) => Math.max(value, node.x + 160), 320),
    height: nodes.reduce((value, node) => Math.max(value, node.y + 82), 180)
  }
}

function nodeSubtitle(system: WormholeSystem): string {
  const reference = system.solarSystemId ? solarSystemById(system.solarSystemId) : undefined
  const security = typeof reference?.security === 'number' && !/^C[1-6]$/i.test(system.systemClass ?? '')
    ? reference.security.toFixed(1)
    : undefined
  return [security, system.systemClass, system.effect].filter(Boolean).join(' · ') || 'Unknown class'
}

export function ExplorationGraph({
  map,
  activeSystemId,
  liveSystemId,
  onSelectSystem,
  onSelectConnection
}: {
  map: ExplorationMap
  activeSystemId?: string
  liveSystemId?: number
  onSelectSystem: (systemId: string) => void
  onSelectConnection: (systemId: string, signatureId: string) => void
}): JSX.Element {
  const layout = useMemo(() => graphLayout(map), [map])
  const nodeById = useMemo(() => new Map(layout.nodes.map((node) => [node.system.id, node])), [layout.nodes])
  const [zoom, setZoom] = useState(0.9)
  const [pan, setPan] = useState({ x: 18, y: 18 })
  const drag = useRef<{ x: number; y: number; panX: number; panY: number }>()
  const graphElement = useRef<SVGSVGElement | null>(null)

  const fitGraph = useCallback((): void => {
    const bounds = graphElement.current?.getBoundingClientRect()
    if (!bounds) return
    const scale = Math.min(1.15, Math.max(0.35, Math.min((bounds.width - 36) / layout.width, (bounds.height - 36) / layout.height)))
    setZoom(scale)
    setPan({
      x: Math.max(18, (bounds.width - layout.width * scale) / 2),
      y: Math.max(18, (bounds.height - layout.height * scale) / 2)
    })
  }, [layout.height, layout.width])

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitGraph)
    return () => window.cancelAnimationFrame(frame)
  }, [map.id, fitGraph])

  function zoomBy(change: number): void {
    setZoom((value) => Math.min(1.6, Math.max(0.45, Number((value + change).toFixed(2)))))
  }

  function onWheel(event: ReactWheelEvent<SVGSVGElement>): void {
    event.preventDefault()
    zoomBy(event.deltaY > 0 ? -0.08 : 0.08)
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.target instanceof Element && event.target.closest('button')) return
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!drag.current) return
    setPan({
      x: drag.current.panX + event.clientX - drag.current.x,
      y: drag.current.panY + event.clientY - drag.current.y
    })
  }

  function stopDragging(): void {
    drag.current = undefined
  }

  return (
    <div className="exploration-graph-shell" role="region" aria-label={`Visual wormhole chain for ${map.name}`}>
      <div className="graph-controls" aria-label="Map zoom controls">
        <button className="btn sm" onClick={() => zoomBy(-0.1)} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="btn sm" onClick={() => zoomBy(0.1)} aria-label="Zoom in">+</button>
        <button className="btn sm" onClick={fitGraph}>Fit</button>
      </div>
      <svg
        ref={graphElement}
        className="exploration-graph"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {layout.edges.map((edge) => {
            const from = nodeById.get(edge.origin.id)
            const to = nodeById.get(edge.destination.id)
            if (!from || !to) return null
            const x1 = from.x + 80
            const y1 = from.y + 39
            const x2 = to.x + 80
            const y2 = to.y + 39
            const labelX = (x1 + x2) / 2 - 58
            const labelY = (y1 + y2) / 2 - 13
            return (
              <g key={`${edge.origin.id}-${edge.signature.id}`}>
                <path className="graph-edge-line" d={`M ${x1} ${y1} C ${x1 + (x2 - x1) / 2} ${y1}, ${x1 + (x2 - x1) / 2} ${y2}, ${x2} ${y2}`} />
                <foreignObject x={labelX} y={labelY} width="116" height="30">
                  <button className="graph-edge-label" onClick={() => onSelectConnection(edge.origin.id, edge.signature.id)}>
                    {edge.signature.sigId || 'Unscanned'} · {edge.signature.wormholeType || '?'}
                  </button>
                </foreignObject>
              </g>
            )
          })}
          {layout.nodes.map(({ system, x, y }) => {
            const activeSignatures = system.signatures.filter((signature) => !signature.closedAt)
            const alerts = activeSignatures.filter((signature) => signature.group === 'wormhole' && (signature.mass === 'critical' || ['under-4h', 'under-1h', 'expired'].includes(signature.life ?? '')))
            const incoming = layout.edges.find((edge) => edge.destination.id === system.id)?.signature
            return (
              <foreignObject key={system.id} x={x} y={y} width="160" height="82">
                <button
                  className={`graph-system-node ${system.id === activeSystemId ? 'active' : ''} ${system.solarSystemId === liveSystemId ? 'live' : ''}`}
                  onClick={() => onSelectSystem(system.id)}
                >
                  <span className="graph-node-heading"><strong>{system.name}</strong>{alerts.length > 0 && <b>{alerts.length}</b>}</span>
                  <span>{nodeSubtitle(system)}</span>
                  <small>{activeSignatures.length} sigs{incoming ? ` · ${LIFE_LABELS[incoming.life ?? 'unknown']} · ${MASS_LABELS[incoming.mass ?? 'unknown']}` : ''}</small>
                </button>
              </foreignObject>
            )
          })}
        </g>
      </svg>
      <div className="graph-hint">Drag empty space to pan · scroll to zoom · select a system or connection for details</div>
    </div>
  )
}
