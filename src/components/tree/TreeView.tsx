import { useState, useRef, useMemo, useCallback, useEffect, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext, useDroppable, pointerWithin,
  MouseSensor, TouchSensor, useSensors, useSensor,
  type DragStartEvent, type DragOverEvent, type DragEndEvent, type CollisionDetection,
} from '@dnd-kit/core'
import {
  useTreeNodes, useMoveNode, buildTree, indexById, wouldCreateCycle, siblingCount,
  type TreeNodeWithChildren,
} from '../../hooks/useTreeNodes'
import { useSheets } from '../../hooks/useSheets'
import { useHabits } from '../../hooks/useHabits'
import type { NodeType } from '../../types'
import type { Sheet } from '../../types'
import TreeNode from './TreeNode'
import NodeConnector from './NodeConnector'
import NodeEditor, { type EditorState } from './NodeEditor'
import MoveToPicker from './MoveToPicker'
import SheetTabs from './SheetTabs'
import SheetForm, { type SheetFormState } from './SheetForm'
import { useT, type Key } from '../../i18n'
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

const TYPE_ENTRIES: { type: NodeType; labelKey: Key }[] = [
  { type: 'vision',  labelKey: 'tree.legendTypeVision' },
  { type: 'goal',    labelKey: 'tree.legendTypeGoal' },
  { type: 'project', labelKey: 'tree.legendTypeProject' },
  { type: 'task',    labelKey: 'tree.legendTypeTask' },
]

function Legend() {
  const t = useT()
  return (
    <div className={styles.legend}>
      <div className={styles.legendSection}>
        <span className={styles.legendHeading}>{t('tree.legendHeadingType')}</span>
        {TYPE_ENTRIES.map(({ type, labelKey }) => (
          <div key={type} className={styles.legendRow}>
            <span
              className={styles.legendDot}
              style={{ '--leg-accent': `var(--ns-${type}-accent)` } as CSSProperties}
            />
            <span className={styles.legendLabel}>{t(labelKey)}</span>
          </div>
        ))}
      </div>
      <div className={styles.legendSection}>
        <span className={styles.legendHeading}>{t('tree.legendHeadingState')}</span>
        <div className={styles.legendRow}>
          <span className={styles.legendStateIdle} />
          <span className={styles.legendLabel}>{t('tree.legendStateNotStarted')}</span>
        </div>
        <div className={styles.legendRow}>
          <span className={styles.legendStateActive} />
          <span className={styles.legendLabel}>{t('tree.legendStateInProgress')}</span>
        </div>
        <div className={styles.legendRow}>
          <span className={styles.legendStateDone}>✓</span>
          <span className={styles.legendLabel}>{t('tree.legendStateComplete')}</span>
        </div>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onAdd, sheetName }: { onAdd: () => void; sheetName: string | null }) {
  const t = useT()
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{sheetName ? t('tree.emptyStateSheetTitle', { sheetName }) : t('tree.emptyStateNoVisionsTitle')}</p>
      <p className={styles.emptyHint}>
        {sheetName
          ? t('tree.emptyStateSheetHint')
          : t('tree.emptyStateVisionHint')}
      </p>
      <button className={styles.emptyBtn} onClick={onAdd}>
        {sheetName ? t('tree.addNodeBtn') : t('tree.emptyStateAddVisionBtn')}
      </button>
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
  const t = useT()
  const { data, isLoading, error } = useTreeNodes()
  const { data: habits = [] } = useHabits()
  const { data: sheets = [], isLoading: sheetsLoading } = useSheets()
  const { mutate: moveNode } = useMoveNode()
  const [searchParams, setSearchParams] = useSearchParams()
  const focusNodeId = searchParams.get('focus')
  const activeSheetId = searchParams.get('sheet')

  const habitByNodeId = useMemo(() => {
    const m = new Map<string, string>()
    for (const h of habits) if (h.treeNodeId) m.set(h.treeNodeId, h.id)
    return m
  }, [habits])

  // nodeId → the Sheet anchored to it — drives the "open sheet" indicator
  // (TreeNode) in place of that node's (now sheet-scoped, invisible-here)
  // subtree. Built from the full sheets list, so it's correct regardless of
  // which canvas is currently being viewed.
  const sheetByAnchorNodeId = useMemo(() => {
    const m = new Map<string, Sheet>()
    for (const s of sheets) if (s.anchorNodeId) m.set(s.anchorNodeId, s)
    return m
  }, [sheets])

  function handleSelectSheet(id: string | null) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (id) next.set('sheet', id); else next.delete('sheet')
      return next
    })
  }

  // A bookmarked/stale ?sheet= id (dissolved elsewhere, or just a bad link)
  // falls back to Main Tree once the sheets list has actually loaded —
  // never before, or a real sheet would flash away during the initial fetch.
  useEffect(() => {
    if (!activeSheetId || sheetsLoading) return
    if (!sheets.some(s => s.id === activeSheetId)) handleSelectSheet(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheetId, sheets, sheetsLoading])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const stageRef = useRef<HTMLDivElement | null>(null)
  const nodesRef = useRef<HTMLDivElement>(null)

  const [editorState, setEditorState] = useState<EditorState | null>(null)
  const [movingNode,  setMovingNode]  = useState<TreeNodeWithChildren | null>(null)
  const [sheetFormState, setSheetFormState] = useState<SheetFormState | null>(null)
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

  // Canvas render tree — filtered to the currently viewed sheet (null =
  // main tree). This is the ONLY place sheet_id filters anything; every
  // count/indicator below reads the UNFILTERED tree instead (TASKS.md §3.5
  // audit rule) so a node moved into a Sheet never silently vanishes from
  // its ancestors' rollups.
  const scopedNodes = useMemo(
    () => (data ?? []).filter(n => n.sheetId === activeSheetId),
    [data, activeSheetId],
  )
  const roots = useMemo(() => buildTree(scopedNodes), [scopedNodes])

  // Unfiltered — spans every sheet plus the main tree — indexed by id so
  // TreeNode can look up each rendered (possibly sheet-scoped) node's TRUE
  // descendant/completion counts for its progress bar and collapse message.
  const unfilteredRoots = useMemo(() => buildTree(data ?? []), [data])
  const unfilteredById  = useMemo(() => indexById(unfilteredRoots), [unfilteredRoots])

  const totalNodes  = scopedNodes.length
  const visionCount = scopedNodes.filter(n => n.type === 'vision' && !n.parentId).length
  const activeSheet = activeSheetId ? sheets.find(s => s.id === activeSheetId) ?? null : null

  // Scroll to + briefly highlight a node linked from a habit card.
  useEffect(() => {
    if (!focusNodeId) return
    const el = document.querySelector(`[data-node-id="${focusNodeId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [focusNodeId, roots.length])

  const handleEdit = useCallback((node: TreeNodeWithChildren) => {
    setEditorState({ mode: 'edit', node })
  }, [])

  /**
   * A new child inherits its parent's sheetId — except a parent that's
   * itself an anchor: its true children all live inside its sheet (that's
   * the whole mechanism), so a child added to an anchor node (reachable
   * even from the main tree, since the anchor still renders there) must
   * land in that sheet too, not alongside the anchor with sheet_id = null.
   */
  const handleAddChild = useCallback((parentId: string, parentType: NodeType) => {
    const anchorSheet = sheetByAnchorNodeId.get(parentId)
    const sheetId = anchorSheet
      ? anchorSheet.id
      : ((data ?? []).find(n => n.id === parentId)?.sheetId ?? activeSheetId)
    setEditorState({ mode: 'create', parentId, parentType, sheetId })
  }, [data, sheetByAnchorNodeId, activeSheetId])

  const handleAddRoot = useCallback(() => {
    setEditorState({ mode: 'create', parentId: null, sheetId: activeSheetId })
  }, [activeSheetId])

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
   *
   * No sheetId is passed to moveNode here — every draggable/droppable node
   * rendered by this one TreeView instance already comes from the same
   * sheet-scoped `scopedNodes` list, so an in-canvas drag can never actually
   * cross a sheet boundary; sheet_id is correctly left untouched.
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
    ? ((error as { message?: string }).message ?? t('common.unknownError'))
    : null

  return (
    <div className={styles.page}>
      {/* Sheet tabs — Main Tree + every Sheet, switchable per SPEC §5.5 */}
      <SheetTabs
        sheets={sheets}
        activeSheetId={activeSheetId}
        onSelect={handleSelectSheet}
        onManage={sheet => setSheetFormState({ mode: 'manage', sheet })}
        onCreateNew={() => setSheetFormState({ mode: 'create' })}
      />

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <span className={styles.statsStar}>✦</span>
        <span className={styles.statsText}>
          {isLoading
            ? t('common.loading')
            : `${t('tree.visionCount', { n: visionCount, count: visionCount })} · ${t('tree.nodeCount', { n: totalNodes, count: totalNodes })}`}
        </span>
        <span className={styles.statsSpacer} />
        <div className={styles.modeToggle} role="group" aria-label={t('tree.displayModeAriaLabel')}>
          <button
            className={`${styles.modeBtn}${viewMode === 'tree' ? ' ' + styles.modeBtnActive : ''}`}
            onClick={() => setViewMode('tree')}
            aria-pressed={viewMode === 'tree'}
          >
            {t('pickers.viewTree')}
          </button>
          <button
            className={`${styles.modeBtn}${viewMode === 'list' ? ' ' + styles.modeBtnActive : ''}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
          >
            {t('pickers.viewList')}
          </button>
        </div>
        {viewMode === 'tree' && (
          <div className={styles.zoomControls} role="group" aria-label={t('tree.zoomGroupAriaLabel')}>
            <button
              className={styles.zoomBtn}
              onClick={() => setTreeZoom(z => clampZoom(z - ZOOM_STEP))}
              disabled={treeZoom <= ZOOM_MIN}
              aria-label={t('tree.zoomOutAriaLabel')}
            >
              −
            </button>
            <span className={styles.zoomLabel}>{Math.round(treeZoom * 100)}%</span>
            <button
              className={styles.zoomBtn}
              onClick={() => setTreeZoom(z => clampZoom(z + ZOOM_STEP))}
              disabled={treeZoom >= ZOOM_MAX}
              aria-label={t('tree.zoomInAriaLabel')}
            >
              +
            </button>
          </div>
        )}
        <button className={styles.addRootBtn} onClick={handleAddRoot}>
          {activeSheetId ? t('tree.addNodeBtn') : t('tree.addVisionBtn')}
        </button>
      </div>

      {/* Scrollable canvas */}
      <div className={styles.canvas}>
        {errorMsg ? (
          <div className={styles.errorState}>
            <p className={styles.errorText}>{t('tree.loadError')}</p>
            <p className={styles.errorHint}>{errorMsg}</p>
          </div>
        ) : !isLoading && roots.length === 0 ? (
          <EmptyState onAdd={handleAddRoot} sheetName={activeSheet?.name ?? null} />
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
                    unfilteredById={unfilteredById}
                    sheetByAnchorNodeId={sheetByAnchorNodeId}
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
        aria-label={legendOpen ? t('tree.hideLegendAriaLabel') : t('tree.showLegendAriaLabel')}
      >
        ?
      </button>

      {/* Scroll hint */}
      {viewMode === 'tree' && roots.length > 1 && (
        <div className={styles.scrollHint}>{t('tree.scrollHint')}</div>
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

      {/* Sheet create / manage modal */}
      {sheetFormState && (
        <SheetForm
          state={sheetFormState}
          allNodes={data ?? []}
          sheets={sheets}
          onClose={() => setSheetFormState(null)}
          onCreated={sheetId => { setSheetFormState(null); handleSelectSheet(sheetId) }}
          onDissolved={sheetId => {
            setSheetFormState(null)
            if (sheetId === activeSheetId) handleSelectSheet(null)
          }}
        />
      )}
    </div>
  )
}
