import { useState, useMemo } from 'react'
import { useMoveNode, siblingCount, wouldCreateCycle, type TreeNodeWithChildren } from '../../hooks/useTreeNodes'
import type { TreeNode, NodeType } from '../../types'
import styles from './MoveToPicker.module.css'

const NODE_TYPE_ORDER: NodeType[] = ['vision', 'goal', 'project', 'task']
const ROOT_SENTINEL = '__ROOT__'

/** node.id plus every id in its subtree — these (and the node itself) are
 *  invalid move targets since dropping onto any of them would create a cycle. */
function collectSubtreeIds(node: TreeNodeWithChildren): Set<string> {
  const ids = new Set<string>([node.id])
  for (const child of node.children) {
    for (const id of collectSubtreeIds(child)) ids.add(id)
  }
  return ids
}

interface Props {
  node:     TreeNodeWithChildren
  allNodes: TreeNode[]
  onClose:  () => void
}

export default function MoveToPicker({ node, allNodes, onClose }: Props) {
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const { mutate: moveNode, isPending } = useMoveNode()

  const invalidIds = useMemo(() => collectSubtreeIds(node), [node])

  const candidates = allNodes
    .filter(n => !invalidIds.has(n.id))
    .filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const ai = NODE_TYPE_ORDER.indexOf(a.type)
      const bi = NODE_TYPE_ORDER.indexOf(b.type)
      return ai !== bi ? ai - bi : a.title.localeCompare(b.title)
    })

  const currentParentKey = node.parentId ?? ROOT_SENTINEL
  const isNoOp = selected === null || selected === currentParentKey

  function handleConfirm() {
    if (isNoOp || isPending) return
    const parentId = selected === ROOT_SENTINEL ? null : selected
    if (parentId && wouldCreateCycle(node.id, parentId, allNodes)) return // defensive re-check
    moveNode(
      { id: node.id, parentId, position: siblingCount(parentId, allNodes) },
      { onSuccess: onClose },
    )
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.modeLabel}>✦ MOVE "{node.title}"</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="move-search">NEW PARENT</label>
          <input
            id="move-search"
            className={styles.input}
            placeholder="Search nodes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.nodeList}>
          <button
            className={`${styles.rootRow}${selected === ROOT_SENTINEL ? ' ' + styles.rowSelected : ''}`}
            onClick={() => setSelected(ROOT_SENTINEL)}
            disabled={currentParentKey === ROOT_SENTINEL}
          >
            <span className={styles.rootIcon}>⌂</span>
            <span className={styles.rootLabel}>Make root node</span>
            {currentParentKey === ROOT_SENTINEL && <span className={styles.currentTag}>current</span>}
          </button>

          {candidates.length === 0 && (
            <p className={styles.emptyHint}>No other nodes found.</p>
          )}
          {candidates.map(n => (
            <button
              key={n.id}
              className={`${styles.nodeRow}${selected === n.id ? ' ' + styles.rowSelected : ''}`}
              onClick={() => setSelected(n.id)}
              disabled={n.id === currentParentKey}
            >
              <span className={styles.nodeTypeDot} style={{ background: `var(--ns-${n.type}-accent)` }} />
              <span className={styles.nodeTitle}>{n.title}</span>
              <span className={styles.nodeType}>{n.type}</span>
              {n.id === currentParentKey && <span className={styles.currentTag}>current</span>}
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={isNoOp || isPending}
          >
            {isPending ? '…' : 'Move here'}
          </button>
        </div>
      </div>
    </div>
  )
}
