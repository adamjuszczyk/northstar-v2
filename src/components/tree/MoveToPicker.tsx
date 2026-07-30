import { useState, useMemo } from 'react'
import {
  useMoveNode, siblingCount, wouldCreateCycle, collectDescendantIds,
  type TreeNodeWithChildren,
} from '../../hooks/useTreeNodes'
import type { TreeNode, NodeType } from '../../types'
import { useT } from '../../i18n'
import styles from './MoveToPicker.module.css'

const NODE_TYPE_ORDER: NodeType[] = ['vision', 'goal', 'project', 'task']
const ROOT_SENTINEL = '__ROOT__'

/**
 * nodeId plus every REAL descendant id, walked over the full unfiltered
 * flat node list rather than `node.children` — these (and the node itself)
 * are invalid move targets since dropping onto any of them would create a
 * cycle. Deliberately not built from the passed-in TreeNodeWithChildren:
 * that tree may be sheet-scoped (this picker is reachable from inside a
 * Sheet's own canvas too), and a descendant tucked into an attached Sheet
 * would otherwise be missing from `node.children` entirely — silently
 * letting it show up as a selectable "new parent" candidate below.
 */
function collectSubtreeIds(nodeId: string, allNodes: TreeNode[]): Set<string> {
  return new Set([nodeId, ...collectDescendantIds(nodeId, allNodes)])
}

interface Props {
  node:     TreeNodeWithChildren
  allNodes: TreeNode[]
  onClose:  () => void
}

export default function MoveToPicker({ node, allNodes, onClose }: Props) {
  const t = useT()
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const { mutate: moveNode, isPending } = useMoveNode()

  function typeLabel(nt: NodeType): string {
    switch (nt) {
      case 'vision':  return t('tree.typeVision')
      case 'goal':    return t('tree.typeGoal')
      case 'project': return t('tree.typeProject')
      case 'task':    return t('tree.typeTask')
    }
  }

  const invalidIds = useMemo(() => collectSubtreeIds(node.id, allNodes), [node.id, allNodes])

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
    // This picker's candidate list spans every Sheet plus the main tree
    // (unlike TreeView's own in-canvas drag, which never crosses a sheet
    // boundary), so reparenting under a specific node must pull the moved
    // node into THAT node's sheet — otherwise it'd render nowhere sensible
    // (still sheet_id = its old sheet, but parent_id now pointing at a node
    // filtered out of that canvas). "Make root node" leaves sheet_id
    // untouched — there's no single sheet context a bare root belongs to.
    //
    // Only actually included when it DIFFERS from the moved node's current
    // sheetId — not merely whenever parentId is set. Before migration_17
    // runs, every node's sheetId is null, so target and moved node always
    // match and this stays undefined, meaning ordinary reparenting (the
    // entire pre-Sheets feature this modal already had) never attempts to
    // write a sheet_id column that might not exist yet. A real difference
    // is only possible once a real Sheet exists, which itself requires the
    // migration to already be live.
    const targetSheetId = parentId ? allNodes.find(n => n.id === parentId)?.sheetId ?? null : undefined
    const sheetId = targetSheetId !== undefined && targetSheetId !== node.sheetId
      ? targetSheetId
      : undefined
    moveNode(
      { id: node.id, parentId, position: siblingCount(parentId, allNodes), sheetId },
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
          <span className={styles.modeLabel}>{t('tree.moveModalTitle', { title: node.title })}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="move-search">{t('tree.newParentLabel')}</label>
          <input
            id="move-search"
            className={styles.input}
            placeholder={t('habits.searchNodesPlaceholder')}
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
            <span className={styles.rootLabel}>{t('tree.makeRootNodeLabel')}</span>
            {currentParentKey === ROOT_SENTINEL && <span className={styles.currentTag}>{t('tree.currentTag')}</span>}
          </button>

          {candidates.length === 0 && (
            <p className={styles.emptyHint}>{t('tree.noOtherNodesFound')}</p>
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
              <span className={styles.nodeType}>{typeLabel(n.type)}</span>
              {n.id === currentParentKey && <span className={styles.currentTag}>{t('tree.currentTag')}</span>}
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>{t('common.cancel')}</button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={isNoOp || isPending}
          >
            {isPending ? '…' : t('tree.moveHereButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
