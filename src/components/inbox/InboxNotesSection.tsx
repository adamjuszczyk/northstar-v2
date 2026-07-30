import { useState, useRef } from 'react'
import { useCreateInboxItem } from '../../hooks/useInboxItems'
import type { InboxItem } from '../../types'
import InboxNoteItem from './InboxNoteItem'
import { useT } from '../../i18n'
import styles from './InboxNotesSection.module.css'

interface Props {
  items:     InboxItem[]  // already scoped to kind === 'note' by the caller
  isLoading: boolean
}

/**
 * Notes tab — capture + flat list only (SPEC §6.3). No filter bar (nothing
 * to filter — no states), no promote, no scheduling. Only Tasks promote to
 * the Tree / get scheduled; Notes are pure unstructured capture.
 */
export default function InboxNotesSection({ items, isLoading }: Props) {
  const t = useT()
  const { mutate: createItem, isPending: creating, error: createError } = useCreateInboxItem()
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const createErrorMsg = createError
    ? ((createError as { message?: string }).message ?? t("inbox.noteSaveError"))
    : null

  function handleCapture() {
    const trimmed = draft.trim()
    if (!trimmed || creating) return
    createItem({ content: trimmed, kind: 'note' }, {
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

  return (
    <div className={styles.section}>
      {/* Capture bar */}
      <div className={styles.capture}>
        <textarea
          ref={textareaRef}
          className={styles.captureInput}
          placeholder={t("inbox.notesCapturePlaceholder")}
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
          aria-label={t("inbox.captureAriaLabel")}
        >
          {creating ? '…' : '+'}
        </button>
      </div>

      {createErrorMsg && <p className={styles.error}>{createErrorMsg}</p>}

      {/* Items */}
      <div className={styles.list}>
        {isLoading && (
          <p className={styles.hint}>{t("common.loading")}</p>
        )}
        {!isLoading && items.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t("inbox.notesEmptyTitle")}</p>
            <p className={styles.hint}>{t("inbox.notesEmptyHint")}</p>
          </div>
        )}
        {items.map(item => (
          <InboxNoteItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
