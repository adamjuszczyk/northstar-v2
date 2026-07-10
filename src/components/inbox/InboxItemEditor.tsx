import { useState, useEffect } from 'react'
import { useUpdateInboxItem } from '../../hooks/useInboxItems'
import type { InboxItem } from '../../types'
import styles from './InboxItemEditor.module.css'

interface Props {
  item:    InboxItem
  onClose: () => void
}

export default function InboxItemEditor({ item, onClose }: Props) {
  const [content, setContent] = useState(item.content)
  const { mutate: updateItem, isPending } = useUpdateInboxItem()

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
          <span className={styles.modeLabel}>✦ EDIT ITEM</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <textarea
          className={styles.contentInput}
          placeholder="Capture a thought, task, or idea…"
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave() }}
          rows={5}
          autoFocus
          disabled={isPending}
        />

        <div className={styles.actions}>
          <span style={{ flex: 1 }} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!content.trim() || isPending}
          >
            {isPending ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
