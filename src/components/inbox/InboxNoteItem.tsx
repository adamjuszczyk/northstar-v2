import { useState } from 'react'
import { useDeleteInboxItem } from '../../hooks/useInboxItems'
import type { InboxItem } from '../../types'
import InboxItemEditor from './InboxItemEditor'
import { useT } from '../../i18n'
import styles from './InboxNoteItem.module.css'

function relativeTime(iso: string, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return t("inbox.timeJustNow")
  if (m < 60)  return t("inbox.timeMinutesAgo", { m })
  const h = Math.floor(m / 60)
  if (h < 24)  return t("inbox.timeHoursAgo", { h })
  const d = Math.floor(h / 24)
  if (d < 7)   return t("inbox.timeDaysAgo", { d, count: d })
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  item: InboxItem
}

/**
 * A Notes-tab row — content + edit + delete only. No state dot, no complete
 * checkbox, no promote/schedule actions: state/promotedNodeId/isCompleted
 * are unused when kind = 'note' (SPEC §6.3 — "Notes has no states").
 */
export default function InboxNoteItem({ item }: Props) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const { mutate: deleteItem, isPending: deleting } = useDeleteInboxItem()

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    const title = `${item.content.slice(0, 48)}${item.content.length > 48 ? '…' : ''}`
    if (!window.confirm(t("common.deleteConfirm", { title }))) return
    deleteItem(item.id)
  }

  return (
    <div className={styles.card}>
      <button
        className={styles.rowMain}
        onClick={() => setEditing(true)}
        aria-label={t("inbox.editNoteAriaLabel")}
      >
        <span className={styles.content}>{item.content}</span>
        <span className={styles.time}>{relativeTime(item.createdAt, t)}</span>
      </button>
      <button
        className={styles.deleteBtn}
        onClick={handleDelete}
        disabled={deleting}
        aria-label={t("inbox.deleteNoteAriaLabel")}
      >✕</button>

      {editing && (
        <InboxItemEditor item={item} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}
