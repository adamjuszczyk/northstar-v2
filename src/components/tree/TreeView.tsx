import { useState, useRef, useMemo, useCallback, useEffect, type CSSProperties } from 'react'
import {
  DndContext, closestCenter, type DragEndEvent,
  MouseSensor, TouchSensor, useSensors, useSensor,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useTreeNodes, useReorderNodes, buildTree, type TreeNodeWithChildren } from '../../hooks/useTreeNodes'
import type { NodeType } from '../../types'
import TreeNode from './TreeNode'
import NodeConnector from './NodeConnector'
import NodeEditor, { type EditorState } from './NodeEditor'
import styles from './TreeView.module.css'

type ViewMode = 'tree' | 'list'

const ZOOM_MIN  = 0.5
const ZOOM_MAX  = 1.5
const ZOOM_STEP = 0.1

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

// ── Legend ────────────────────────────────────────────────────────────────────

const TYPE_ENTRIES: { type: NodeType; label: string }[] = [
  { type: 'vision',  label: 'Vision' },
  { type: 'goal',    label: 'Goal' },
  { type: 'project', label: 'Project' },
  { type: 'task',    label: 'Task' },
]

function Legend() {
  return (
    <div className={styles.legend}>
      <div className={styles.legendSection}>
        <span className={styles.legendHeading}>TYPE</span>
        {TYPE_ENTRIES.map(({ type, label }) => (
          <div key={type} className={styles.legendRow}>
            <span
              className={styles.legendDot}
              style={{ '--leg-accent': `var(--ns-${type}-accent)` } as CSSProperties}
            />
            <span className={styles.legendLabel}>{label}</span>
          </div>
        ))}
      </div>
      <div className={styles.legendSection}>
        <span className={styles.legendHeading}>STATE</span>
        <div className={styles.legendRow}>
          <span className={styles.legendStateIdle} />
          <span className={styles.legendLabel}>Not started</span>
        </div>
        <div className={styles.legendRow}>
          <span className={styles.legendStateActive} />
          <span className={styles.legendLabel}>In progress</span>
        </div>
        <div className={styles.legendRow}>
          <span className={styles.legendStateDone}>✓</span>
          <span className={styles.legendLabel}>Complete</span>
        </div>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>No visions yet</p>
      <p className={styles.emptyHint}>Start by adding a top-level vision to anchor your goal tree.</p>
      <button className={styles.emptyBtn} onClick={onAdd}>+ Add vision</button>
    </div>
  )
}

// ── TreeView ───────────────────────────────────────────────────────────────────

export default function TreeView() {
  const { data, isLoading, error } = useTreeNodes()
  const { mutate: reorderNodes } = useReorderNodes()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const stageRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<HTMLDivElement>(null)

  const [editorState, setEditorState] = useState<EditorState | null>(null)
  const [legendOpen,  setLegendOpen]  = useState(false)
  const [structureVersion, setStructureVersion] = useState(0)
  const bumpStructureVersion = useCallback(() => setStructureVersion(v => v + 1), [])

  // Default: tree mode on desktop, list mode on mobile — user can toggle freely afterward.
  const [viewMode, setViewMode] = useState<ViewMode>(() => (
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'tree'
  ))

  // Zoom applies to tree mode only — 50% to 150%, default 100%.
  const [treeZoom, setTreeZoom] = useState(1)

  // Pinch-to-zoom (mobile). Attached as a native, non-passive listener so
  // touchmove can preventDefault() and stop the browser's own page-zoom
  // gesture from fighting with ours — React's synthetic touch handlers are
  // passive by default and can't do that.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return

    let startDist = 0
    let startZoom = 1

    function dist(t1: Touch, t2: Touch) {
      return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
    }
    function onTouchStart(e: TouchEvent) {
      if (viewMode !== 'tree' || e.touches.length !== 2) return
      startDist = dist(e.touches[0], e.touches[1])
      startZoom = treeZoom
    }
    function onTouchMove(e: TouchEvent) {
      if (startDist === 0 || e.touches.length !== 2) return
      e.preventDefault()
      const d = dist(e.touches[0], e.touches[1])
      setTreeZoom(clampZoom(startZoom * (d / startDist)))
    }
    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) startDist = 0
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [viewMode, treeZoom])

  const roots      = useMemo(() => buildTree(data ?? []), [data])
  const totalNodes = data?.length ?? 0
  const visionCount = data?.filter(n => n.type === 'vision' && !n.parentId).length ?? 0

  const handleEdit = useCallback((node: TreeNodeWithChildren) => {
    setEditorState({ mode: 'edit', node })
  }, [])

  const handleAddChild = useCallback((parentId: string, parentType: NodeType) => {
    setEditorState({ mode: 'create', parentId, parentType })
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const flat       = data ?? []
    const activeNode = flat.find(n => n.id === String(active.id))
    const overNode   = flat.find(n => n.id === String(over.id))
    if (!activeNode || !overNode) return
    if (activeNode.parentId !== overNode.parentId) return

    const siblings = flat
      .filter(n => n.parentId === activeNode.parentId)
      .sort((a, b) => a.position - b.position)

    const oldIdx = siblings.findIndex(s => s.id === activeNode.id)
    const newIdx = siblings.findIndex(s => s.id === overNode.id)
    if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return

    const reordered = arrayMove(siblings, oldIdx, newIdx)
    reorderNodes({ updates: reordered.map((s, i) => ({ id: s.id, position: i })) })
  }, [data, reorderNodes])

  const errorMsg = error
    ? ((error as { message?: string }).message ?? 'Unknown error')
    : null

  return (
    <div className={styles.page}>
      {/* Stats bar */}
      <div className={styles.statsBar}>
        <span className={styles.statsStar}>✦</span>
        <span className={styles.statsText}>
          {isLoading
            ? 'Loading…'
            : `${visionCount} vision${visionCount !== 1 ? 's' : ''} · ${totalNodes} node${totalNodes !== 1 ? 's' : ''}`}
        </span>
        <span className={styles.statsSpacer} />
        <div className={styles.modeToggle} role="group" aria-label="Tree display mode">
          <button
            className={`${styles.modeBtn}${viewMode === 'tree' ? ' ' + styles.modeBtnActive : ''}`}
            onClick={() => setViewMode('tree')}
            aria-pressed={viewMode === 'tree'}
          >
            TREE
          </button>
          <button
            className={`${styles.modeBtn}${viewMode === 'list' ? ' ' + styles.modeBtnActive : ''}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
          >
            LIST
          </button>
        </div>
        {viewMode === 'tree' && (
          <div className={styles.zoomControls} role="group" aria-label="Tree zoom">
            <button
              className={styles.zoomBtn}
              onClick={() => setTreeZoom(z => clampZoom(z - ZOOM_STEP))}
              disabled={treeZoom <= ZOOM_MIN}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className={styles.zoomLabel}>{Math.round(treeZoom * 100)}%</span>
            <button
              className={styles.zoomBtn}
              onClick={() => setTreeZoom(z => clampZoom(z + ZOOM_STEP))}
              disabled={treeZoom >= ZOOM_MAX}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        )}
        <button
          className={styles.addRootBtn}
          onClick={() => setEditorState({ mode: 'create', parentId: null })}
        >
          + Vision
        </button>
      </div>

      {/* Scrollable canvas */}
      <div className={styles.canvas}>
        {errorMsg ? (
          <div className={styles.errorState}>
            <p className={styles.errorText}>Failed to load tree</p>
            <p className={styles.errorHint}>{errorMsg}</p>
          </div>
        ) : !isLoading && roots.length === 0 ? (
          <EmptyState onAdd={() => setEditorState({ mode: 'create', parentId: null })} />
        ) : (
          <div
            ref={stageRef}
            className={`${styles.stage}${viewMode === 'list' ? ' tree-list-mode' : ''}`}
            style={viewMode === 'tree' ? { zoom: treeZoom } : undefined}
          >
            {/* SVG connector overlay — horizontal-layout bezier math, tree mode only */}
            {viewMode === 'tree' && (
              <NodeConnector
                stageRef={stageRef}
                nodesRef={nodesRef}
                structureVersion={structureVersion}
                zoom={treeZoom}
              />
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div ref={nodesRef} className={styles.nodes}>
                <SortableContext
                  items={roots.map(r => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {roots.map(r => (
                    <TreeNode
                      key={r.id}
                      node={r}
                      parentId={null}
                      onEdit={handleEdit}
                      onAddChild={handleAddChild}
                      onStructureChange={bumpStructureVersion}
                    />
                  ))}
                </SortableContext>
              </div>
            </DndContext>
          </div>
        )}
      </div>

      {/* Legend toggle + panel */}
      {legendOpen && <Legend />}
      <button
        className={styles.legendToggle}
        onClick={() => setLegendOpen(o => !o)}
        aria-label={legendOpen ? 'Hide legend' : 'Show legend'}
      >
        ?
      </button>

      {/* Scroll hint */}
      {viewMode === 'tree' && roots.length > 1 && (
        <div className={styles.scrollHint}>SCROLL TO EXPLORE THE TREE →</div>
      )}

      {/* Node editor modal */}
      {editorState && (
        <NodeEditor state={editorState} onClose={() => setEditorState(null)} />
      )}
    </div>
  )
}
