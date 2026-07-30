import { useState, useRef, useCallback } from 'react'
import { useCreateInboxItem, useUpdateInboxItem } from '../../hooks/useInboxItems'
import type { InboxItem } from '../../types'
import { useT } from '../../i18n'
import InboxItemComponent from './InboxItem'
import NodeEditor, { type EditorState } from '../tree/NodeEditor'
import styles from './InboxTasksSection.module.css'

type InboxFilter = 'all' | 'unassigned' | 'scheduled' | 'promoted' | 'completed'

function getFilters(t: ReturnType<typeof useT>): { key: InboxFilter; label: string }[] {
  return [
    { key: 'all',        label: t('inbox.filterAll') },
    { key: 'unassigned', label: t('inbox.filterUnassigned') },
    { key: 'scheduled',  label: t('inbox.filterScheduled') },
    { key: 'promoted',   label: t('inbox.filterPromoted') },
    { key: 'completed',  label: t('inbox.filterCompleted') },
  ]
}

function matchesFilter(item: InboxItem, filter: InboxFilter): boolean {
  switch (filter) {
    // 'all' now means "everything not finished" — finished tasks are hidden
    // by default (SPEC §6.3) and stay reachable via the Completed filter.
    // The filter bar itself keeps its original five options unchanged.
    case 'all':        return !item.isCompleted
    case 'unassigned': return item.state === 'unassigned' && !item.isCompleted
    case 'scheduled':  return item.state === 'scheduled' && !item.isCompleted
    case 'promoted':   return item.promotedNodeId !== null
    case 'completed':  return item.isCompleted
  }
}

interface Props {
  items:     InboxItem[]  // already scoped to kind === 'task' by the caller
  isLoading: boolean
}

export default function InboxTasksSection({ items, isLoading }: Props) {
  const t = useT()
  const FILTERS = getFilters(t)
  const { mutate: createItem, isPending: creating, error: createError } = useCreateInboxItem()
  const { mutate: updateItem } = useUpdateInboxItem()

  const [draft,        setDraft]        = useState('')
  const [promoteItem,  setPromoteItem]  = useState<InboxItem | null>(null)
  const [filter,       setFilter]       = useState<InboxFilter>('all')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredItems = items.filter(i => matchesFilter(i, filter))
  const carriedOver = filteredItems.filter(i => i.state === 'unassigned' && !i.isCompleted && i.carriedOver)
  const unassigned  = filteredItems.filter(i => i.state === 'unassigned' && !i.isCompleted && !i.carriedOver)
  const processed   = filteredItems.filter(i => i.state !== 'unassigned' || i.isCompleted)

  function handleCapture() {
    const trimmed = draft.trim()
    if (!trimmed || creating) return
    createItem({ content: trimmed, kind: 'task' }, {
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

  const promoteEditorState: EditorState | null = promoteItem
    ? { mode: 'create', parentId: null, prefillTitle: promoteItem.content, sheetId: null }
    : null

  const createErrorMsg = createError
    ? ((createError as { message?: string }).message ?? t('inbox.createTaskError'))
    : null

  return (
    <div className={styles.section}>
      {/* Capture bar */}
      <div className={styles.capture}>
        <textarea
          ref={textareaRef}
          className={styles.captureInput}
          placeholder={t('inbox.capturePlaceholder')}
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
          aria-label={t('inbox.captureAriaLabel')}
        >
          {creating ? '…' : '+'}
        </button>
      </div>

      {createErrorMsg && <p className={styles.error}>{createErrorMsg}</p>}

      {/* Filter bar */}
      <div className={styles.filterBar} role="tablist" aria-label={t('inbox.filterTasksAriaLabel')}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            className={`${styles.filterChip}${filter === f.key ? ' ' + styles.filterChipActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className={styles.list}>
        {isLoading && (
          <p className={styles.hint}>{t('common.loading')}</p>
        )}
        {!isLoading && items.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t('inbox.emptyCapturedTitle')}</p>
            <p className={styles.hint}>{t('inbox.emptyCapturedHint')}</p>
          </div>
        )}
        {!isLoading && items.length > 0 && filteredItems.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t('inbox.emptyFilterTitle')}</p>
            <p className={styles.hint}>{t('inbox.emptyFilterHint')}</p>
          </div>
        )}

        {carriedOver.length > 0 && (
          <section className={styles.itemGroup}>
            <span className={`${styles.sectionLabel} ${styles.sectionLabelCarried}`}>{t('inbox.carriedOverSectionLabel')}</span>
            {carriedOver.map(item => (
              <InboxItemComponent key={item.id} item={item} onPromote={handlePromote} />
            ))}
          </section>
        )}

        {unassigned.length > 0 && (
          <section className={styles.itemGroup}>
            {unassigned.map(item => (
              <InboxItemComponent key={item.id} item={item} onPromote={handlePromote} />
            ))}
          </section>
        )}

        {processed.length > 0 && (
          <section className={styles.itemGroup}>
            <span className={styles.sectionLabel}>{t('inbox.processedSectionLabel')}</span>
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
