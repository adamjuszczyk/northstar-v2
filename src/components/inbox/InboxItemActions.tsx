import { useState, useRef, useEffect, type CSSProperties } from 'react'
import {
  useDeleteInboxItem,
  useScheduleInboxToDay,
  useScheduleInboxToWeek,
  useScheduleInboxToMonth,
} from '../../hooks/useInboxItems'
import { weekStart } from '../../lib/dates'
import type { InboxItem } from '../../types'
import styles from './InboxItemActions.module.css'

type ScheduleTarget = 'day' | 'week' | 'month' | null

interface Props {
  item:      InboxItem
  onPromote: () => void
  onClose:   () => void
}

export default function InboxItemActions({ item, onPromote, onClose }: Props) {
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget>(null)
  const [dateValue,      setDateValue]      = useState('')
  const [error,          setError]          = useState<string | null>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  const { mutate: deleteItem,  isPending: deleting  } = useDeleteInboxItem()
  const { mutate: scheduleDay, isPending: dayPending } = useScheduleInboxToDay()
  const { mutate: scheduleWeek,isPending: wkPending  } = useScheduleInboxToWeek()
  const { mutate: scheduleMon, isPending: moPending  } = useScheduleInboxToMonth()

  const isPending = deleting || dayPending || wkPending || moPending

  useEffect(() => {
    if (scheduleTarget) {
      setDateValue('')
      setError(null)
      setTimeout(() => dateRef.current?.focus(), 50)
    }
  }, [scheduleTarget])

  function openSchedule(target: ScheduleTarget) {
    setScheduleTarget(prev => prev === target ? null : target)
  }

  function handleScheduleSubmit() {
    if (!dateValue) return
    setError(null)

    if (scheduleTarget === 'day') {
      scheduleDay(
        { itemId: item.id, date: dateValue },
        { onSuccess: onClose, onError: e => setError((e as Error).message) }
      )
    } else if (scheduleTarget === 'week') {
      // Always the canonical Monday key — independent of the display setting.
      scheduleWeek(
        { itemId: item.id, weekStart: weekStart(dateValue) },
        { onSuccess: onClose, onError: e => setError((e as Error).message) }
      )
    } else if (scheduleTarget === 'month') {
      const monthStart = `${dateValue}-01`
      scheduleMon(
        { itemId: item.id, monthStart },
        { onSuccess: onClose, onError: e => setError((e as Error).message) }
      )
    }
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${item.content.slice(0, 48)}${item.content.length > 48 ? '…' : ''}"?`)) return
    deleteItem(item.id, { onSuccess: onClose })
  }

  const inputType = scheduleTarget === 'month' ? 'month' : 'date'

  return (
    <div className={styles.panel}>
      {/* Primary actions */}
      <div className={styles.row}>
        <button
          className={styles.actionBtn}
          style={{ '--btn-accent': 'var(--ns-gold)', '--btn-accent-rgb': 'var(--ns-gold-rgb)' } as CSSProperties}
          onClick={onPromote}
          disabled={isPending}
        >
          <span className={styles.btnIcon}>→</span>
          Promote to tree
        </button>
      </div>

      {/* Schedule actions */}
      <div className={styles.scheduleRow}>
        <span className={styles.scheduleLabel}>SCHEDULE TO</span>
        <div className={styles.scheduleBtns}>
          {(['day', 'week', 'month'] as const).map(t => (
            <button
              key={t}
              className={`${styles.scheduleChip}${scheduleTarget === t ? ' ' + styles.scheduleChipActive : ''}`}
              onClick={() => openSchedule(t)}
              disabled={isPending}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Inline date picker */}
      {scheduleTarget && (
        <div className={styles.pickerRow}>
          <input
            ref={dateRef}
            type={inputType}
            className={styles.datePicker}
            value={dateValue}
            onChange={e => setDateValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleScheduleSubmit() }}
          />
          <button
            className={styles.confirmBtn}
            onClick={handleScheduleSubmit}
            disabled={!dateValue || isPending}
          >
            {isPending ? '…' : '↵'}
          </button>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {/* Delete */}
      <div className={styles.deleteRow}>
        <button
          className={styles.deleteBtn}
          onClick={handleDelete}
          disabled={isPending}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
