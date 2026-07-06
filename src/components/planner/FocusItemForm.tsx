import { useState, useEffect } from 'react'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import type { TreeNode, NodeType } from '../../types'
import styles from './FocusItemForm.module.css'

const NODE_TYPE_ORDER: NodeType[] = ['vision', 'goal', 'project', 'task']

const SOURCE_LABELS: Record<NodeType, string> = {
  vision:  '◈ vision',
  goal:    '◆ goal',
  project: '▸ project',
  task:    '· task',
}

interface Props {
  label:       string            // e.g. "ADD WEEKLY FOCUS" or "ADD MONTHLY FOCUS"
  onClose:     () => void
  onSave: (input: {
    source:      'standalone' | 'tree'
    title?:      string
    treeNodeId?: string
  }) => void
  isSaving: boolean
}

export default function FocusItemForm({ label, onClose, onSave, isSaving }: Props) {
  const [tab,        setTab]        = useState<'standalone' | 'tree'>('standalone')
  const [title,      setTitle]      = useState('')
  const [treeNodeId, setTreeNodeId] = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [error,      setError]      = useState<string | null>(null)

  const { data: treeNodes = [] } = useTreeNodes()

  const filteredNodes = treeNodes
    .filter(n => n.status !== 'complete')
    .filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const ai = NODE_TYPE_ORDER.indexOf(a.type)
      const bi = NODE_TYPE_ORDER.indexOf(b.type)
      return ai !== bi ? ai - bi : a.title.localeCompare(b.title)
    })

  useEffect(() => {
    setTitle('')
    setTreeNodeId(null)
    setSearch('')
    setError(null)
  }, [tab])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function isValid() {
    return tab === 'standalone' ? title.trim().length > 0 : treeNodeId !== null
  }

  function handleSubmit() {
    if (!isValid() || isSaving) return
    setError(null)
    if (tab === 'standalone') {
      onSave({ source: 'standalone', title: title.trim() })
    } else {
      onSave({ source: 'tree', treeNodeId: treeNodeId! })
    }
  }

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
            <label className={styles.fieldLabel} htmlFor="fi-search">GOAL TREE NODE</label>
            <input
              id="fi-search"
              className={styles.input}
              placeholder="Search nodes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            <div className={styles.nodeList}>
              {filteredNodes.length === 0 && (
                <p className={styles.emptyHint}>No active nodes found.</p>
              )}
              {filteredNodes.map(n => (
                <NodeRow
                  key={n.id}
                  node={n}
                  selected={treeNodeId === n.id}
                  onSelect={() => setTreeNodeId(n.id)}
                />
              ))}
            </div>
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
            {isSaving ? '…' : 'Add'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Shared node picker row ─────────────────────────────────────────────────────

interface NodeRowProps { node: TreeNode; selected: boolean; onSelect: () => void }

function NodeRow({ node, selected, onSelect }: NodeRowProps) {
  return (
    <button
      className={`${styles.nodeRow}${selected ? ' ' + styles.nodeRowSelected : ''}`}
      onClick={onSelect}
    >
      <span
        className={styles.nodeTypeDot}
        style={{ background: `var(--ns-${node.type}-accent)` }}
      />
      <span className={styles.nodeTitle}>{node.title}</span>
      <span className={styles.nodeType}>{SOURCE_LABELS[node.type]}</span>
    </button>
  )
}
