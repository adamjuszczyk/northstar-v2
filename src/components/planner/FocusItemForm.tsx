import { useState, useEffect } from 'react'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import TreeNodePicker from '../pickers/TreeNodePicker'
import styles from './FocusItemForm.module.css'

interface Props {
  label:           string            // e.g. "ADD WEEKLY FOCUS" or "ADD MONTHLY FOCUS"
  onClose:         () => void
  onSaveStandalone: (title: string) => void
  onSaveTree:       (treeNodeIds: string[]) => void
  isSaving:        boolean
  /** treeNodeIds already flagged for the current week/month — drives the
   *  picker's "already in focus" indicator on parent nodes. */
  focusedNodeIds?: Set<string>
  /** Used in the picker's indicator tooltip, e.g. "this week" / "this month". */
  focusLabel?:     string
}

export default function FocusItemForm({
  label, onClose, onSaveStandalone, onSaveTree, isSaving, focusedNodeIds, focusLabel,
}: Props) {
  const [tab,         setTab]         = useState<'standalone' | 'tree'>('standalone')
  const [title,       setTitle]       = useState('')
  const [treeNodeIds, setTreeNodeIds] = useState<Set<string>>(new Set())
  const [error,       setError]       = useState<string | null>(null)

  const { data: treeNodes = [] } = useTreeNodes()

  const activeNodes = treeNodes.filter(n => n.status !== 'complete')

  useEffect(() => {
    setTitle('')
    setTreeNodeIds(new Set())
    setError(null)
  }, [tab])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleTreeNode(id: string) {
    setTreeNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function isValid() {
    return tab === 'standalone' ? title.trim().length > 0 : treeNodeIds.size > 0
  }

  function handleSubmit() {
    if (!isValid() || isSaving) return
    setError(null)
    if (tab === 'standalone') {
      onSaveStandalone(title.trim())
    } else {
      onSaveTree(Array.from(treeNodeIds))
    }
  }

  const addLabel = isSaving
    ? '…'
    : tab === 'tree' && treeNodeIds.size > 0
      ? `Add ${treeNodeIds.size} item${treeNodeIds.size > 1 ? 's' : ''}`
      : 'Add'

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.headerLabel}>✦ {label}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab}${tab === 'standalone' ? ' ' + styles.tabActive : ''}`}
            onClick={() => setTab('standalone')}
          >+ New task</button>
          <button
            className={`${styles.tab}${tab === 'tree' ? ' ' + styles.tabActive : ''}`}
            onClick={() => setTab('tree')}
          >✦ From tree</button>
        </div>

        {tab === 'standalone' && (
          <div className={styles.body}>
            <label className={styles.fieldLabel} htmlFor="fi-title">TASK</label>
            <input
              id="fi-title"
              className={styles.input}
              placeholder="What are you focusing on?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              autoFocus
            />
          </div>
        )}

        {tab === 'tree' && (
          <div className={styles.body}>
            <label className={styles.fieldLabel}>GOAL TREE NODES</label>
            <TreeNodePicker
              nodes={activeNodes}
              selectedIds={treeNodeIds}
              onToggleSelect={toggleTreeNode}
              focusedNodeIds={focusedNodeIds}
              focusLabel={focusLabel}
              emptyHint="No active nodes found."
            />
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSubmit}
            disabled={!isValid() || isSaving}
          >
            {addLabel}
          </button>
        </div>

      </div>
    </div>
  )
}
