import { useState } from 'react'
import { countDescendants, type TreeNodeWithChildren } from '../../hooks/useTreeNodes'
import type { NodeType } from '../../types'
import styles from './TreeListView.module.css'

const TYPE_LABEL: Record<NodeType, string> = {
  vision: 'VIS', goal: 'GOAL', project: 'PROJ', task: 'TASK',
}

interface RowProps {
  node:       TreeNodeWithChildren
  depth:      number
  collapsed:  Set<string>
  onToggle:   (id: string) => void
  onEdit:     (node: TreeNodeWithChildren) => void
}

function ListRow({ node, depth, collapsed, onToggle, onEdit }: RowProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const isDone      = node.status === 'complete'

  const rows = [
    <button
      key={node.id}
      className={styles.row}
      style={{ paddingLeft: 12 + depth * 18, '--row-accent': `var(--ns-${node.type}-accent)`, '--row-accent-rgb': `var(--ns-${node.type}-accent-rgb)` } as React.CSSProperties}
      onClick={() => onEdit(node)}
    >
      {hasChildren ? (
        <span
          className={styles.chev}
          style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          onClick={e => { e.stopPropagation(); onToggle(node.id) }}
          role="button"
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >⌄</span>
      ) : (
        <span className={styles.chevSpacer} />
      )}

      <span className={styles.typeBadge}>{TYPE_LABEL[node.type]}</span>

      <span className={[
        styles.statusDot,
        isDone ? styles.statusDone : node.status === 'in_progress' ? styles.statusActive : styles.statusIdle,
      ].join(' ')}>
        {isDone ? '✓' : ''}
      </span>

      <span className={[styles.title, isDone ? styles.titleDone : ''].filter(Boolean).join(' ')}>
        {node.title}
      </span>

      {hasChildren && isCollapsed && (
        <span className={styles.childCount}>+{countDescendants(node)}</span>
      )}
    </button>,
  ]

  if (hasChildren && !isCollapsed) {
    node.children.forEach(child => {
      rows.push(
        <ListRow
          key={child.id}
          node={child}
          depth={depth + 1}
          collapsed={collapsed}
          onToggle={onToggle}
          onEdit={onEdit}
        />
      )
    })
  }

  return <>{rows}</>
}

interface Props {
  roots:  TreeNodeWithChildren[]
  onEdit: (node: TreeNodeWithChildren) => void
}

export default function TreeListView({ roots, onEdit }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={styles.list}>
      {roots.map(r => (
        <ListRow key={r.id} node={r} depth={0} collapsed={collapsed} onToggle={toggle} onEdit={onEdit} />
      ))}
    </div>
  )
}
