import { useState, useEffect, type CSSProperties } from 'react'
import {
  useCreateNode, useUpdateNode, useDeleteNode, useTreeNodes,
  type TreeNodeWithChildren,
} from '../../hooks/useTreeNodes'
import type { NodeType, NodeStatus } from '../../types'
import styles from './NodeEditor.module.css'

const TYPES: NodeType[]   = ['vision', 'goal', 'project', 'task']
const STATUSES: NodeStatus[] = ['not_started', 'in_progress', 'complete']
const STATUS_LABELS: Record<NodeStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete:    'Complete',
}

function suggestChildType(parentType: NodeType | null): NodeType {
  if (!parentType) return 'vision'
  if (parentType === 'vision')   return 'goal'
  if (parentType === 'goal')     return 'project'
  return 'task'
}

export type EditorState =
  | { mode: 'create'; parentId: string | null; parentType?: NodeType; prefillTitle?: string }
  | { mode: 'edit';   node: TreeNodeWithChildren }

interface Props {
  state:     EditorState
  onClose:   () => void
  onCreated?: (nodeId: string) => void
}

export default function NodeEditor({ state, onClose, onCreated }: Props) {
  const isCreate = state.mode === 'create'

  const [type,   setType]   = useState<NodeType>(
    isCreate ? suggestChildType(state.parentType ?? null) : state.node.type
  )
  const [title,  setTitle]  = useState(
    isCreate ? (state.prefillTitle ?? '') : state.node.title
  )
  const [notes,  setNotes]  = useState(isCreate ? '' : (state.node.notes ?? ''))
  const [status, setStatus] = useState<NodeStatus>(isCreate ? 'not_started' : state.node.status)

  const { data: allNodes } = useTreeNodes()
  const { mutate: createNode, isPending: creating } = useCreateNode()
  const { mutate: updateNode, isPending: updating } = useUpdateNode()
  const { mutate: deleteNode, isPending: deleting } = useDeleteNode()

  const isPending = creating || updating || deleting

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    const trimmed = title.trim()
    if (!trimmed) return

    if (isCreate) {
      const parentId = state.parentId ?? null
      const siblings = (allNodes ?? []).filter(n => n.parentId === parentId)
      createNode({
        parentId, type, title: trimmed,
        notes: notes.trim() || null,
        position: siblings.length,
      }, {
        onSuccess: (node) => {
          onCreated?.(node.id)
          onClose()
        },
      })
    } else {
      updateNode({
        id:     state.node.id,
        type, title: trimmed,
        notes:  notes.trim() || null,
        status,
      }, { onSuccess: onClose })
    }
  }

  function handleDelete() {
    if (state.mode !== 'edit') return
    const childCount = countDesc(state.node)
    const msg = childCount > 0
      ? `Delete "${state.node.title}" and its ${childCount} descendant${childCount > 1 ? 's' : ''}?`
      : `Delete "${state.node.title}"?`
    if (!window.confirm(msg)) return
    deleteNode(state.node.id, { onSuccess: onClose })
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const chipVar = (t: NodeType): CSSProperties => ({
    '--chip-accent':     `var(--ns-${t}-accent)`,
    '--chip-accent-rgb': `var(--ns-${t}-accent-rgb)`,
  } as CSSProperties)

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.modeLabel}>
            {isCreate ? '✦ NEW NODE' : '✦ EDIT NODE'}
          </span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Type */}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>TYPE</span>
          <div className={styles.typeRow}>
            {TYPES.map(t => (
              <button
                key={t}
                style={chipVar(t)}
                className={`${styles.typeChip}${type === t ? ' ' + styles.typeChipActive : ''}`}
                onClick={() => setType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ns-editor-title">TITLE</label>
          <input
            id="ns-editor-title"
            className={styles.titleInput}
            placeholder="Name this node…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
        </div>

        {/* Notes */}
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ns-editor-notes">
            NOTES <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            id="ns-editor-notes"
            className={styles.notesInput}
            placeholder="Add context…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Status — edit mode only */}
        {!isCreate && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>STATUS</span>
            <div className={styles.statusRow}>
              {STATUSES.map(s => (
                <button
                  key={s}
                  className={`${styles.statusBtn}${status === s ? ' ' + styles.statusBtnActive : ''}`}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {!isCreate && (
            <button
              className={styles.deleteBtn}
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!title.trim() || isPending}
          >
            {isCreate ? 'Add node' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function countDesc(node: TreeNodeWithChildren): number {
  return node.children.reduce((s, c) => s + 1 + countDesc(c), 0)
}
