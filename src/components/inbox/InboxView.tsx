import { useState, useRef, useCallback } from 'react'
import { useInboxItems, useCreateInboxItem, useUpdateInboxItem } from '../../hooks/useInboxItems'
import type { InboxItem } from '../../types'
import InboxItemComponent from './InboxItem'
import NodeEditor, { type EditorState } from '../tree/NodeEditor'
import styles from './InboxView.module.css'

export default function InboxView() {
  const { data: items = [], isLoading, error } = useInboxItems()
  const { mutate: createItem, isPending: creating } = useCreateInboxItem()
  const { mutate: updateItem } = useUpdateInboxItem()

  const [draft,        setDraft]        = useState('')
  const [promoteItem,  setPromoteItem]  = useState<InboxItem | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const carriedOver = items.filter(i => i.state === 'unassigned' && i.carriedOver)
  const unassigned  = items.filter(i => i.state === 'unassigned' && !i.carriedOver)
  const processed   = items.filter(i => i.state !== 'unassigned')
  const unassignedCount = carriedOver.length + unassigned.length

  function handleCapture() {
    const trimmed = draft.trim()
    if (!trimmed || creating) return
    createItem(trimmed, {
      onSuccess: () => {
        setDraft('')
        textareaRef.current?.focus()
      },
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCapture()
    }
  }

  const handlePromote = useCallback((item: InboxItem) => {
    setPromoteItem(item)
  }, [])

  function handlePromoteCreated(nodeId: string) {
    if (!promoteItem) return
    updateItem(
      { id: promoteItem.id, state: 'promoted', promotedNodeId: nodeId },
      { onSuccess: () => setPromoteItem(null) }
    )
  }

  const errorMsg = error ? ((error as { message?: string }).message ?? 'Unknown error') : null

  const promoteEditorState: EditorState | null = promoteItem
    ? { mode: 'create', parentId: null, prefillTitle: promoteItem.content }
    : null

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.star}>✦</span>
        <span className={styles.title}>Inbox</span>
        {!isLoading && unassignedCount > 0 && (
          <span className={styles.badge}>{unassignedCount}</span>
        )}
      </div>

      {/* Capture bar */}
      <div className={styles.capture}>
        <textarea
          ref={textareaRef}
          className={styles.captureInput}
          placeholder="Capture a thought, task, or idea… (Enter to save)"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={creating}
        />
        <button
          className={styles.captureBtn}
          onClick={handleCapture}
          disabled={!draft.trim() || creating}
          aria-label="Capture"
        >
          {creating ? '…' : '+'}
        </button>
      </div>

      {/* Error */}
      {errorMsg && (
        <p className={styles.error}>{errorMsg}</p>
      )}

      {/* Items */}
      <div className={styles.list}>
        {isLoading && (
          <p className={styles.hint}>Loading…</p>
        )}
        {!isLoading && items.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Nothing captured yet</p>
            <p className={styles.hint}>Use the field above to capture anything on your mind.</p>
          </div>
        )}

        {carriedOver.length > 0 && (
          <section className={styles.section}>
            <span className={`${styles.sectionLabel} ${styles.sectionLabelCarried}`}>↻ CARRIED OVER</span>
            {carriedOver.map(item => (
              <InboxItemComponent key={item.id} item={item} onPromote={handlePromote} />
            ))}
          </section>
        )}

        {unassigned.length > 0 && (
          <section className={styles.section}>
            {unassigned.map(item => (
              <InboxItemComponent key={item.id} item={item} onPromote={handlePromote} />
            ))}
          </section>
        )}

        {processed.length > 0 && (
          <section className={styles.section}>
            <span className={styles.sectionLabel}>PROCESSED</span>
            {processed.map(item => (
              <InboxItemComponent key={item.id} item={item} onPromote={handlePromote} />
            ))}
          </section>
        )}
      </div>

      {/* NodeEditor for promote flow */}
      {promoteEditorState && (
        <NodeEditor
          state={promoteEditorState}
          onClose={() => setPromoteItem(null)}
          onCreated={handlePromoteCreated}
        />
      )}
    </div>
  )
}
