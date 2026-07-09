import { useState, useRef, useMemo, useCallback, useEffect, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext, useDroppable, pointerWithin,
  MouseSensor, TouchSensor, useSensors, useSensor,
  type DragStartEvent, type DragOverEvent, type DragEndEvent, type CollisionDetection,
} from '@dnd-kit/core'
import {
  useTreeNodes, useMoveNode, buildTree, wouldCreateCycle, siblingCount,
  type TreeNodeWithChildren,
} from '../../hooks/useTreeNodes'
import { useHabits } from '../../hooks/useHabits'
import type { NodeType } from '../../types'
import TreeNode from './TreeNode'
import NodeConnector from './NodeConnector'
import NodeEditor, { type EditorState } from './NodeEditor'
import MoveToPicker from './MoveToPicker'
import styles from './TreeView.module.css'

const CANVAS_ROOT_DROP_ID = 'tree-canvas-root'

/**
 * pointerWithin reports every droppable whose rect contains the pointer —
 * since node cards sit inside the canvas droppable, both match at once.
 * Prefer the node (more specific) whenever one is under the pointer; only
 * fall back to the canvas root-drop zone when nothing else matches.
 */
const reparentCollisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  if (hits.length === 0) return hits
  const nodeHits = hits.filter(h => h.id !== CANVAS_ROOT_DROP_ID)
  return nodeHits.length > 0 ? nodeHits : hits
}

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

// ── Canvas stage (droppable root-drop zone) ─────────────────────────────────────
//
// useDroppable must be called by a component that DndContext actually renders
// as a descendant — calling it directly in TreeView's body doesn't work,
// because TreeView is the ANCESTOR that creates <DndContext> as its own
// child; a hook call in TreeView's own function scope never resolves against
// a context that TreeView itself renders further down the tree. This small
// wrapper is rendered *inside* <DndContext>, so its useDroppable call
// actually registers.

interface CanvasStageProps {
  stageRef:  React.MutableRefObject<HTMLDivElement | null>
  className: string
  style?:    CSSProperties
  isDragActive: boolean
  children:  React.ReactNode
}

function CanvasStage({ stageRef, className, style, isDragActive, children }: CanvasStageProps) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_ROOT_DROP_ID })
  const setRefs = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el
    setNodeRef(el)
  }, [stageRef, setNodeRef])

  return (
    <div
      ref={setRefs}
      className={`${className}${isDragActive && isOver ? ' ' + styles.stageRootDrop : ''}`}
      style={style}
    >
      {children}
    </div>
  )
}

// ── TreeView ───────────────────────────────────────────────────────────────────

export default function TreeView() {
  const { data, isLoading, error } = useTreeNodes()
  const { data: habits = [] } = useHabits()
  const { mutate: moveNode } = useMoveNode()
  const [searchParams] = useSearchParams()
  const focusNodeId = searchParams.get('focus')

  const habitByNodeId = useMemo(() => {
    const m = new Map<string, string>()
    for (const h of habits) if (h.treeNodeId) m.set(h.treeNodeId, h.id)
    return m
  }, [habits])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const stageRef = useRef<HTMLDivElement | null>(null)
  const nodesRef = useRef<HTMLDivElement>(null)

  const [editorState, setEditorState] = useState<EditorState | null>(null)
  const [movingNode,  setMovingNode]  = useState<TreeNodeWithChildren | null>(null)
  const [legendOpen,  setLegendOpen]  = useState(false)
  const [structureVersion, setStructureVersion] = useState(0)
  const bumpStructureVersion = useCallback(() => setStructureVersion(v => v + 1), [])

  // Drag-to-reparent state — activeId drives "am I the thing being dragged"
  // (per-node via its own useDraggable), overId + overInvalid drive the
  // valid/invalid drop-target highlight threaded down through TreeNode.
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId,   setOverId]   = useState<string | null>(null)

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

  // Scroll to + briefly highlight a node linked from a habit card.
  useEffect(() => {
    if (!focusNodeId) return
    const el = document.querySelector(`[data-node-id="${focusNodeId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [focusNodeId, roots.length])

  const handleEdit = useCallback((node: TreeNodeWithChildren) => {
    setEditorState({ mode: 'edit', node })
  }, [])

  const handleAddChild = useCallback((parentId: string, parentType: NodeType) => {
    setEditorState({ mode: 'create', parentId, parentType })
  }, [])

  const overInvalid = useMemo(() => {
    if (!activeId || !overId || overId === CANVAS_ROOT_DROP_ID) return false
    return wouldCreateCycle(activeId, overId, data ?? [])
  }, [activeId, overId, data])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null)
  }, [])

  /**
   * Both drop targets — a node card, or the empty canvas — resolve to the
   * exact same reparent write. Circular drops are rejected outright; a drop
   * on the node's current parent (or onto the canvas while already a root)
   * is a no-op, matching the "moving to current parent does nothing" rule.
   */
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null)
    setOverId(null)

    const { active, over } = event
    if (!over) return

    const flat       = data ?? []
    const activeNode = flat.find(n => n.id === String(active.id))
    if (!activeNode) return

    const targetId = String(over.id)
    const newParentId = targetId === CANVAS_ROOT_DROP_ID ? null : targetId

    if (newParentId === activeNode.parentId) return // no-op: dropped on current parent / already root
    if (newParentId && wouldCreateCycle(activeNode.id, newParentId, flat)) return // reject: circular

    moveNode({
      id:       activeNode.id,
      parentId: newParentId,
      position: siblingCount(newParentId, flat),
    })
  }, [data, moveNode])

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
          <DndContext
            sensors={sensors}
            collisionDetection={reparentCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <CanvasStage
              stageRef={stageRef}
              className={[styles.stage, viewMode === 'list' ? 'tree-list-mode' : ''].filter(Boolean).join(' ')}
              style={viewMode === 'tree' ? { zoom: treeZoom } : undefined}
              isDragActive={!!activeId}
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

              <div ref={nodesRef} className={styles.nodes}>
                {roots.map(r => (
                  <TreeNode
                    key={r.id}
                    node={r}
                    parentId={null}
                    onEdit={handleEdit}
                    onAddChild={handleAddChild}
                    onStructureChange={bumpStructureVersion}
                    dropTargetId={overId === CANVAS_ROOT_DROP_ID ? null : overId}
                    dropInvalid={overInvalid}
                    habitByNodeId={habitByNodeId}
                    focusNodeId={focusNodeId}
                  />
                ))}
              </div>
            </CanvasStage>
          </DndContext>
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
        <NodeEditor
          state={editorState}
          onClose={() => setEditorState(null)}
          onMoveTo={editorState.mode === 'edit' ? (node) => { setEditorState(null); setMovingNode(node) } : undefined}
        />
      )}

      {/* Move-to picker (drag-and-drop fallback) */}
      {movingNode && (
        <MoveToPicker
          node={movingNode}
          allNodes={data ?? []}
          onClose={() => setMovingNode(null)}
        />
      )}
    </div>
  )
}
