import { useState, type CSSProperties } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useUpdateNode,
  countDescendants, countCompleted,
  type TreeNodeWithChildren,
} from '../../hooks/useTreeNodes'
import type { NodeType, NodeStatus } from '../../types'
import styles from './TreeNode.module.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

function cx(...cs: (string | false | undefined | null)[]): string {
  return cs.filter(Boolean).join(' ')
}

function nodeVars(type: NodeType): CSSProperties {
  return {
    '--ns-node-accent':     `var(--ns-${type}-accent)`,
    '--ns-node-accent-rgb': `var(--ns-${type}-accent-rgb)`,
    '--ns-node-text':       `var(--ns-${type}-text)`,
    '--ns-node-bg':         `var(--ns-${type}-bg)`,
    '--ns-node-shadow':     `var(--ns-${type}-shadow)`,
    '--ns-node-radius':     `var(--ns-${type}-radius)`,
    '--ns-node-padding':    `var(--ns-${type}-padding)`,
    '--ns-node-min-w':      `var(--ns-${type}-min-w)`,
    '--ns-node-max-w':      `var(--ns-${type}-max-w)`,
    '--ns-node-fs':         `var(--ns-${type}-fs)`,
    '--ns-node-font':       type === 'vision' ? 'var(--ns-font-display)' : 'var(--ns-font-ui)',
    '--ns-node-fw':         type === 'vision' ? 'var(--ns-fw-normal)'
                          : type === 'task'   ? 'var(--ns-fw-book)'
                          :                    'var(--ns-fw-semibold)',
    '--ns-node-gap':        type === 'vision' ? 'var(--ns-vision-gap)'
                          : type === 'goal'   ? 'var(--ns-goal-gap)'
                          :                    'var(--ns-project-gap)',
    '--ns-node-border-op':  type === 'vision' ? 'var(--ns-vision-border-op)'
                          : type === 'goal'   ? 'var(--ns-goal-border-op)'
                          :                    'var(--ns-project-border-op)',
  } as CSSProperties
}

function cycleStatus(s: NodeStatus): NodeStatus {
  if (s === 'not_started') return 'in_progress'
  if (s === 'in_progress') return 'complete'
  return 'not_started'
}

// ── StatusDot ─────────────────────────────────────────────────────────────────

function StatusDot({
  status, onClick,
}: {
  status:  NodeStatus
  onClick: (e: React.MouseEvent) => void
}) {
  const stopPtr = (e: React.PointerEvent) => e.stopPropagation()

  if (status === 'complete') {
    return (
      <button
        className={cx(styles.dot, styles.dotDone)}
        onClick={onClick}
        onPointerDown={stopPtr}
        title="Mark not started"
      >✓</button>
    )
  }
  if (status === 'in_progress') {
    return (
      <button
        className={cx(styles.dot, styles.dotActive)}
        onClick={onClick}
        onPointerDown={stopPtr}
        title="Mark complete"
      />
    )
  }
  return (
    <button
      className={cx(styles.dot, styles.dotIdle)}
      onClick={onClick}
      onPointerDown={stopPtr}
      title="Mark in progress"
    />
  )
}

// ── ProgressBar (vision only) ─────────────────────────────────────────────────

function ProgressBar({ node }: { node: TreeNodeWithChildren }) {
  const total = countDescendants(node)
  const done  = countCompleted(node)
  const pct   = total > 0 ? Math.round(done / total * 100) : 0
  return (
    <div className={styles.progressRow}>
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.progressLabel}>{done}/{total} done</span>
    </div>
  )
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

interface Props {
  node:       TreeNodeWithChildren
  parentId:   string | null
  onEdit:     (node: TreeNodeWithChildren) => void
  onAddChild: (parentId: string, parentType: NodeType) => void
}

export default function TreeNode({ node, parentId, onEdit, onAddChild }: Props) {
  const isTask   = node.type === 'task'
  const isVision = node.type === 'vision'
  const isDone   = node.status === 'complete'

  const [collapsed, setCollapsed] = useState(false)

  const { mutate: updateNode } = useUpdateNode()

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: node.id })

  const dndStyle: CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.45 : 1,
    position:   'relative',
  }

  const hasChildren     = node.children.length > 0
  const showChildrenCol = !collapsed && hasChildren
  const kidsAreTasks    = hasChildren && node.children[0].type === 'task'

  function onDotClick(e: React.MouseEvent) {
    e.stopPropagation()
    updateNode({ id: node.id, status: cycleStatus(node.status) })
  }

  function onCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation()
    updateNode({ id: node.id, status: isDone ? 'not_started' : 'complete' })
  }

  // ── Task card ───────────────────────────────────────────────────────────────

  if (isTask) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...dndStyle, ...nodeVars(node.type) }}
        className={styles.taskRow}
        {...attributes}
      >
        <div
          data-node-id={node.id}
          data-parent-id={parentId ?? ''}
          data-type={node.type}
          data-state={node.status}
          className={cx(styles.taskCard, isDone && styles.cardDone)}
          onDoubleClick={() => onEdit(node)}
          {...listeners}
        >
          <button
            className={cx(styles.taskCheck, isDone && styles.taskCheckDone)}
            onClick={onCheckboxClick}
            onPointerDown={e => e.stopPropagation()}
            aria-label={isDone ? 'Mark not started' : 'Mark complete'}
          >
            {isDone ? '✓' : ''}
          </button>
          <span className={cx(styles.taskTitle, isDone && styles.taskTitleDone)}>
            {node.title}
          </span>
        </div>
      </div>
    )
  }

  // ── Container card (vision / goal / project) ─────────────────────────────

  return (
    <div
      ref={setNodeRef}
      style={{ ...dndStyle, ...nodeVars(node.type) }}
      className={styles.row}
      {...attributes}
    >
      {/* Card */}
      <div
        data-node-id={node.id}
        data-parent-id={parentId ?? ''}
        data-type={node.type}
        data-state={node.status}
        className={cx(styles.card, isDone && styles.cardDone)}
        onDoubleClick={() => onEdit(node)}
        {...listeners}
      >
        {isVision && <div className={styles.halo} />}

        {/* Head row */}
        <div className={styles.head}>
          <StatusDot status={node.status} onClick={onDotClick} />
          <span className={styles.typeLabel}>{node.type}</span>
          <span className={styles.headSpacer} />
          <button
            className={cx(styles.headBtn, styles.addBtn)}
            onClick={e => { e.stopPropagation(); onAddChild(node.id, node.type) }}
            onPointerDown={e => e.stopPropagation()}
            aria-label="Add child node"
          >
            +
          </button>
          {hasChildren && (
            <button
              className={cx(styles.headBtn, styles.chevBtn)}
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}
              onPointerDown={e => e.stopPropagation()}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
            >
              ⌄
            </button>
          )}
        </div>

        {/* Title */}
        <div className={styles.title}>
          {node.title}
        </div>

        {/* Vision progress bar */}
        {isVision && !isDone && <ProgressBar node={node} />}

        {/* Collapsed message */}
        {collapsed && hasChildren && (
          <div className={styles.collapseMsg}>
            {countDescendants(node)} nodes hidden
          </div>
        )}
      </div>

      {/* Children column */}
      {showChildrenCol && (
        <div className={cx(styles.children, kidsAreTasks && styles.childrenTask)}>
          <SortableContext items={node.children.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {node.children.map(child => (
              <TreeNode
                key={child.id}
                node={child}
                parentId={node.id}
                onEdit={onEdit}
                onAddChild={onAddChild}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}
