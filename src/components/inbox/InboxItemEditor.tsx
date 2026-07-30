import { useState, useEffect } from 'react'
import { useUpdateInboxItem } from '../../hooks/useInboxItems'
import { useTaskForRef } from '../../hooks/useTasks'
import TaskStepList from '../day/TaskStepList'
import type { InboxItem } from '../../types'
import { useT } from '../../i18n'
import styles from './InboxItemEditor.module.css'

interface Props {
  item:    InboxItem
  onClose: () => void
}

export default function InboxItemEditor({ item, onClose }: Props) {
  const t = useT()
  const [content, setContent] = useState(item.content)
  const { mutate: updateItem, isPending } = useUpdateInboxItem()
  // Task Lists & Split (SPEC §5.3) — "creatable everywhere," not only
  // retroactively from Day view. Notes have no completable-action concept,
  // so this is task-only.
  const { data: existingTask } = useTaskForRef(
    item.kind === 'task' ? { source: 'inbox', inboxItemId: item.id } : null
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    const trimmed = content.trim()
    if (!trimmed) return
    updateItem({ id: item.id, content: trimmed }, { onSuccess: onClose })
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.modeLabel}>{t("day.modeLabelEditItem")}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>

        <textarea
          className={styles.contentInput}
          placeholder={t("inbox.editContentPlaceholder")}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave() }}
          rows={5}
          autoFocus
          disabled={isPending}
        />

        {item.kind === 'task' && (
          <TaskStepList
            taskId={existingTask?.id ?? null}
            taskRef={{ source: 'inbox', inboxItemId: item.id }}
          />
        )}

        <div className={styles.actions}>
          <span style={{ flex: 1 }} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
            {t("common.cancel")}
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!content.trim() || isPending}
          >
            {isPending ? '…' : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  )
}
