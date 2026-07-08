import { useRef, useState, useLayoutEffect, useEffect, useCallback, type CSSProperties } from 'react'

interface ConnectorPath {
  d: string
  x1: number; y1: number; x2: number; y2: number
  fromColor: string; toColor: string
  fromOp: number; toOp: number
  w: number; op: number
  dashed: boolean
}

const WID: Record<string, number> = {
  vision: 2.7, goal: 2.1, project: 1.7, task: 1.5, add: 1.6,
}

function resolveAccent(type: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--ns-${type}-accent`)
    .trim()
}

interface Props {
  stageRef:         React.RefObject<HTMLDivElement | null>
  nodesRef:         React.RefObject<HTMLDivElement | null>
  /** Bumped by TreeView whenever any node's collapse state toggles — forces
   *  an immediate recompute independent of the MutationObserver/RAF path. */
  structureVersion?: number
}

export default function NodeConnector({ stageRef, nodesRef, structureVersion }: Props) {
  const [paths, setPaths]   = useState<ConnectorPath[]>([])
  const [svgW,  setSvgW]   = useState(0)
  const [svgH,  setSvgH]   = useState(0)
  const sigRef              = useRef('')
  const scheduledRef        = useRef(false)

  const compute = useCallback(() => {
    const stage = stageRef.current
    const nodes = nodesRef.current
    if (!stage || !nodes) return

    const base = stage.getBoundingClientRect()
    const els  = nodes.querySelectorAll<HTMLElement>('[data-node-id]')

    type Info = { x: number; y: number; w: number; h: number; type: string; state: string; dashed: boolean }
    const map: Record<string, Info> = {}

    els.forEach(el => {
      const r = el.getBoundingClientRect()
      map[el.dataset.nodeId!] = {
        x: r.left - base.left,
        y: r.top  - base.top,
        w: r.width,
        h: r.height,
        type:   el.dataset.type   || 'task',
        state:  el.dataset.state  || 'not_started',
        dashed: el.dataset.dashed === '1',
      }
    })

    const newPaths: ConnectorPath[] = []

    els.forEach(el => {
      const pid = el.dataset.parentId
      if (!pid) return
      const p = map[pid], c = map[el.dataset.nodeId!]
      if (!p || !c) return

      const x1 = p.x + p.w,  y1 = p.y + p.h / 2
      const x2 = c.x,         y2 = c.y + c.h / 2
      const dx = Math.max(30, x2 - x1)
      const c1x = x1 + dx * 0.55
      const c2x = x2 - dx * 0.55
      const d = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`

      const isDone   = c.state === 'complete'
      const isDashed = c.dashed

      newPaths.push({
        d, x1, y1, x2, y2,
        fromColor: resolveAccent(p.type),
        toColor:   isDashed ? resolveAccent('vision') : resolveAccent(c.type),
        fromOp:    isDashed ? 0.9 : 0.85,
        toOp:      isDashed ? 0.45 : (isDone ? 0.22 : 0.6),
        w:         WID[p.type] ?? 1.6,
        op:        isDashed ? 0.85 : (isDone ? 0.3 : 0.62),
        dashed:    isDashed,
      })
    })

    const W = Math.max(stage.scrollWidth, nodes.scrollWidth, base.width)
    const H = Math.max(stage.scrollHeight, nodes.scrollHeight, base.height)
    const sig = JSON.stringify(newPaths) + `|${W}x${H}`
    if (sig === sigRef.current) return
    sigRef.current = sig
    setPaths(newPaths)
    setSvgW(W)
    setSvgH(H)
  }, [stageRef, nodesRef])

  // Coalesced via queueMicrotask rather than requestAnimationFrame — rAF is
  // throttled/paused entirely for backgrounded or hidden tabs, which could
  // stall recomputation indefinitely after a mutation. Microtasks always run
  // promptly regardless of tab visibility, and still execute after the
  // triggering DOM mutation/layout is committed.
  const schedule = useCallback(() => {
    if (scheduledRef.current) return
    scheduledRef.current = true
    queueMicrotask(() => {
      scheduledRef.current = false
      compute()
    })
  }, [compute])

  useLayoutEffect(() => {
    schedule()

    const ro = new ResizeObserver(schedule)
    if (stageRef.current) ro.observe(stageRef.current)
    if (nodesRef.current) ro.observe(nodesRef.current)

    const mo = new MutationObserver(schedule)
    if (nodesRef.current) {
      mo.observe(nodesRef.current, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['data-state', 'style'],
        characterData: true,
      })
    }

    window.addEventListener('resize', schedule)
    if (document.fonts?.ready) document.fonts.ready.then(schedule)

    const t1 = setTimeout(schedule, 300)
    const t2 = setTimeout(schedule, 900)

    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', schedule)
      clearTimeout(t1)
      clearTimeout(t2)
      scheduledRef.current = false
    }
  }, [schedule])

  // Explicit collapse-state dependency: any collapse/expand toggle anywhere
  // in the tree bumps structureVersion, forcing an immediate recompute here
  // rather than relying solely on the MutationObserver noticing the DOM
  // removal/insertion.
  useEffect(() => {
    schedule()
  }, [structureVersion, schedule])

  if (!paths.length) return null

  const svgStyle: CSSProperties = {
    position: 'absolute', left: 0, top: 0,
    overflow: 'visible', pointerEvents: 'none', zIndex: 1,
  }

  return (
    <svg width={svgW} height={svgH} style={svgStyle}>
      <defs>
        {paths.map((p, i) => (
          <linearGradient
            key={`g${i}`} id={`nsg${i}`}
            gradientUnits="userSpaceOnUse"
            x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
          >
            <stop offset="0%"   stopColor={p.fromColor} stopOpacity={p.fromOp} />
            <stop offset="100%" stopColor={p.toColor}   stopOpacity={p.toOp} />
          </linearGradient>
        ))}
        <filter id="nsCGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Glow layer */}
      {paths.map((p, i) => (
        <path
          key={`glow${i}`}
          d={p.d}
          fill="none"
          stroke={`url(#nsg${i})`}
          strokeWidth={p.w + 5}
          strokeLinecap="round"
          opacity={0.16}
          filter="url(#nsCGlow)"
          strokeDasharray={p.dashed ? '2 8' : undefined}
        />
      ))}

      {/* Crisp layer */}
      {paths.map((p, i) => (
        <path
          key={`crisp${i}`}
          d={p.d}
          fill="none"
          stroke={`url(#nsg${i})`}
          strokeWidth={p.w}
          strokeLinecap="round"
          opacity={p.op}
          strokeDasharray={p.dashed ? '2 8' : undefined}
        />
      ))}
    </svg>
  )
}
