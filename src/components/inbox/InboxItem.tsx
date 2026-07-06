import { useState, type CSSProperties } from 'react'
import type { InboxItem as InboxItemType } from '../../types'
import InboxItemActions from './InboxItemActions'
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
  const [open, setOpen] = useState(false)

  return (
    <div
      className={`${styles.card}${open ? ' ' + styles.cardOpen : ''}`}
      style={{ '--state': `var(--ns-inbox-${item.state})` } as CSSProperties}
    >
      {/* Row: click toggles action panel */}
      <button
        className={styles.row}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={open ? 'Collapse' : 'Expand item actions'}
      >
        <span className={styles.stateDot} />
        <span className={styles.content}>{item.content}</span>
        <span className={styles.meta}>
          <span className={styles.stateLabel}>{STATE_LABEL[item.state]}</span>
          <span className={styles.time}>{relativeTime(item.createdAt)}</span>
          <span className={`${styles.chevron}${open ? ' ' + styles.chevronOpen : ''}`}>›</span>
        </span>
      </button>

      {/* Inline action panel */}
      {open && (
        <InboxItemActions
          item={item}
          onPromote={() => { setOpen(false); onPromote(item) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
