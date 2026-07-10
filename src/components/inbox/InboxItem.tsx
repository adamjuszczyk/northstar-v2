import { useState, type CSSProperties } from 'react'
import { useUpdateInboxItem } from '../../hooks/useInboxItems'
import type { InboxItem as InboxItemType } from '../../types'
import InboxItemActions from './InboxItemActions'
import InboxItemEditor from './InboxItemEditor'
import styles from './InboxItem.module.css'

const STATE_LABEL: Record<InboxItemType['state'], string> = {
  unassigned: 'inbox',
  scheduled:  'scheduled',
  promoted:   'promoted',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)   return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  item:      InboxItemType
  onPromote: (item: InboxItemType) => void
}

export default function InboxItem({ item, onPromote }: Props) {
  const [open,     setOpen]     = useState(false)
  const [editing,  setEditing]  = useState(false)
  const { mutate: updateItem, isPending: toggling } = useUpdateInboxItem()

  function handleToggleComplete(e: React.MouseEvent) {
    e.stopPropagation()
    updateItem({ id: item.id, isCompleted: !item.isCompleted })
  }

  return (
    <div
      className={`${styles.card}${open ? ' ' + styles.cardOpen : ''}${item.carriedOver ? ' ' + styles.cardCarried : ''}`}
      style={{ '--state': `var(--ns-inbox-${item.state})` } as CSSProperties}
    >
      <div className={styles.row}>
        <button
          className={`${styles.check}${item.isCompleted ? ' ' + styles.checkDone : ''}`}
          onClick={handleToggleComplete}
          disabled={toggling}
          aria-label={item.isCompleted ? 'Mark incomplete' : 'Mark complete'}
        >
          {item.isCompleted ? '✓' : ''}
        </button>

        {/* Main row: click toggles action panel */}
        <button
          className={styles.rowMain}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label={open ? 'Collapse' : 'Expand item actions'}
        >
          <span className={styles.stateDot} />
          <span className={`${styles.content}${item.isCompleted ? ' ' + styles.contentDone : ''}`}>
            {item.content}
          </span>
          <span className={styles.meta}>
            {item.isCompleted && <span className={styles.doneBadge}>DONE</span>}
            <span className={styles.stateLabel}>{item.carriedOver ? 'carried over' : STATE_LABEL[item.state]}</span>
            <span className={styles.time}>{relativeTime(item.createdAt)}</span>
            <span className={`${styles.chevron}${open ? ' ' + styles.chevronOpen : ''}`}>›</span>
          </span>
        </button>
      </div>

      {/* Inline action panel */}
      {open && (
        <InboxItemActions
          item={item}
          onPromote={() => { setOpen(false); onPromote(item) }}
          onEdit={() => { setOpen(false); setEditing(true) }}
          onClose={() => setOpen(false)}
        />
      )}

      {/* Edit sheet */}
      {editing && (
        <InboxItemEditor item={item} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}
