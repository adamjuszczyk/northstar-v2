import { useState, useRef, useMemo, useCallback, type CSSProperties } from 'react'
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
        <button
          className={styles.addRootBtn}
          onClick={() => setEditorState({ mode: 'create', parentId: null })}
        >
          + Vision
        </button>
      </div>

      {/* Scrollable canvas */}
      <div className={styles.canvas}>
        <div ref={stageRef} className={styles.stage}>
          {/* SVG connector overlay */}
          <NodeConnector stageRef={stageRef} nodesRef={nodesRef} structureVersion={structureVersion} />

          {/* Node tree */}
          {errorMsg ? (
            <div className={styles.errorState}>
              <p className={styles.errorText}>Failed to load tree</p>
              <p className={styles.errorHint}>{errorMsg}</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div ref={nodesRef} className={styles.nodes}>
                {!isLoading && roots.length === 0 ? (
                  <EmptyState onAdd={() => setEditorState({ mode: 'create', parentId: null })} />
                ) : (
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
                )}
              </div>
            </DndContext>
          )}
        </div>
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
      {roots.length > 1 && (
        <div className={styles.scrollHint}>SCROLL TO EXPLORE THE TREE →</div>
      )}

      {/* Node editor modal */}
      {editorState && (
        <NodeEditor state={editorState} onClose={() => setEditorState(null)} />
      )}
    </div>
  )
}
