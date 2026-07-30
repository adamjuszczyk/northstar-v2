import { useState, type CSSProperties } from 'react'
import { useUpdateInboxItem } from '../../hooks/useInboxItems'
import type { InboxItem as InboxItemType } from '../../types'
import { useT } from '../../i18n'
import InboxItemActions from './InboxItemActions'
import InboxItemEditor from './InboxItemEditor'
import styles from './InboxItem.module.css'

function getStateLabel(t: ReturnType<typeof useT>): Record<InboxItemType['state'], string> {
  return {
    unassigned: t('inbox.stateLabelUnassigned'),
    scheduled:  t('inbox.stateLabelScheduled'),
    promoted:   t('inbox.stateLabelPromoted'),
  }
}

function relativeTime(iso: string, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return t('inbox.timeJustNow')
  if (m < 60)  return t('inbox.timeMinutesAgo', { m })
  const h = Math.floor(m / 60)
  if (h < 24)  return t('inbox.timeHoursAgo', { h })
  const d = Math.floor(h / 24)
  if (d < 7)   return t('inbox.timeDaysAgo', { d, count: d })
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  item:      InboxItemType
  onPromote: (item: InboxItemType) => void
}

export default function InboxItem({ item, onPromote }: Props) {
  const t = useT()
  const STATE_LABEL = getStateLabel(t)
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
          aria-label={item.isCompleted ? t('common.markIncomplete') : t('common.markComplete')}
        >
          {item.isCompleted ? '✓' : ''}
        </button>

        {/* Main row: click toggles action panel */}
        <button
          className={styles.rowMain}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label={open ? t('inbox.collapseAriaLabel') : t('inbox.expandItemActionsAriaLabel')}
        >
          <span className={styles.stateDot} />
          <span className={`${styles.content}${item.isCompleted ? ' ' + styles.contentDone : ''}`}>
            {item.content}
          </span>
          <span className={styles.meta}>
            {item.isCompleted && <span className={styles.doneBadge}>{t('day.doneBadgeLabel')}</span>}
            <span className={styles.stateLabel}>{item.carriedOver ? t('inbox.carriedOverInlineLabel') : STATE_LABEL[item.state]}</span>
            <span className={styles.time}>{relativeTime(item.createdAt, t)}</span>
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
