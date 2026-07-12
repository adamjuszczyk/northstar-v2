import { useState, useEffect, type CSSProperties } from 'react'
import { addDays, addMonths } from 'date-fns'
import {
  useDeleteInboxItem,
  useScheduleInboxToDay,
  useScheduleInboxToWeek,
  useScheduleInboxToMonth,
} from '../../hooks/useInboxItems'
import { weekStart, monthStart, todayISO, toISODate } from '../../lib/dates'
import type { InboxItem } from '../../types'
import WeekPicker from '../pickers/WeekPicker'
import DayPicker from '../pickers/DayPicker'
import MonthPicker from '../pickers/MonthPicker'
import styles from './InboxItemActions.module.css'

type ScheduleTarget = 'day' | 'week' | 'month' | null

const QUICK_OPTIONS: Record<'day' | 'week' | 'month', { label: string; value: () => string }[]> = {
  day: [
    { label: 'Today',    value: () => todayISO() },
    { label: 'Tomorrow', value: () => toISODate(addDays(new Date(), 1)) },
  ],
  week: [
    { label: 'This week', value: () => weekStart(new Date()) },
    { label: 'Next week', value: () => weekStart(addDays(new Date(), 7)) },
  ],
  month: [
    { label: 'This month', value: () => monthStart(new Date()) },
    { label: 'Next month', value: () => monthStart(addMonths(new Date(), 1)) },
  ],
}

interface Props {
  item:      InboxItem
  onPromote: () => void
  onEdit:    () => void
  onClose:   () => void
}

export default function InboxItemActions({ item, onPromote, onEdit, onClose }: Props) {
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget>(null)
  const [dateValue,      setDateValue]      = useState('')
  // Always a valid Monday key — never empty — so WeekPicker never renders an invalid date.
  const [weekValue,      setWeekValue]      = useState(() => weekStart(new Date()))
  const [error,          setError]          = useState<string | null>(null)

  const { mutate: deleteItem,  isPending: deleting  } = useDeleteInboxItem()
  const { mutate: scheduleDay, isPending: dayPending } = useScheduleInboxToDay()
  const { mutate: scheduleWeek,isPending: wkPending  } = useScheduleInboxToWeek()
  const { mutate: scheduleMon, isPending: moPending  } = useScheduleInboxToMonth()

  const isPending = deleting || dayPending || wkPending || moPending

  useEffect(() => {
    if (scheduleTarget) {
      setError(null)
      if (scheduleTarget === 'week') {
        setWeekValue(weekStart(new Date()))
      } else {
        setDateValue('')
      }
    }
  }, [scheduleTarget])

  function openSchedule(target: ScheduleTarget) {
    setScheduleTarget(prev => prev === target ? null : target)
  }

  function submitSchedule(target: 'day' | 'week' | 'month', value: string) {
    setError(null)
    const onError = (e: unknown) => setError((e as Error).message)

    if (target === 'day') {
      scheduleDay({ itemId: item.id, date: value }, { onSuccess: onClose, onError })
    } else if (target === 'week') {
      // value is already the canonical Monday key.
      scheduleWeek({ itemId: item.id, weekStart: value }, { onSuccess: onClose, onError })
    } else if (target === 'month') {
      scheduleMon({ itemId: item.id, monthStart: value }, { onSuccess: onClose, onError })
    }
  }

  function handleScheduleSubmit() {
    if (scheduleTarget === 'day' && dateValue) {
      submitSchedule('day', dateValue)
    } else if (scheduleTarget === 'week' && weekValue) {
      submitSchedule('week', weekValue)
    } else if (scheduleTarget === 'month' && dateValue) {
      submitSchedule('month', `${dateValue}-01`)
    }
  }

  function handleQuickSchedule(value: string) {
    if (scheduleTarget === 'day' || scheduleTarget === 'week' || scheduleTarget === 'month') {
      submitSchedule(scheduleTarget, value)
    }
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${item.content.slice(0, 48)}${item.content.length > 48 ? '…' : ''}"?`)) return
    deleteItem(item.id, { onSuccess: onClose })
  }

  const submitDisabled = isPending || (scheduleTarget === 'week' ? !weekValue : !dateValue)

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
        <button
          className={styles.actionBtn}
          style={{ '--btn-accent': 'var(--ns-project-accent)', '--btn-accent-rgb': 'var(--ns-project-accent-rgb)' } as CSSProperties}
          onClick={onEdit}
          disabled={isPending}
        >
          <span className={styles.btnIcon}>✎</span>
          Edit
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

      {/* Quick scheduling chips */}
      {scheduleTarget && (
        <div className={styles.quickRow}>
          {QUICK_OPTIONS[scheduleTarget].map(opt => (
            <button
              key={opt.label}
              className={styles.quickChip}
              onClick={() => handleQuickSchedule(opt.value())}
              disabled={isPending}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Inline picker */}
      {scheduleTarget && (
        <div className={styles.pickerRow}>
          {scheduleTarget === 'week' && <WeekPicker value={weekValue} onChange={setWeekValue} />}
          {scheduleTarget === 'day'  && <DayPicker value={dateValue} onChange={setDateValue} />}
          {scheduleTarget === 'month' && <MonthPicker value={dateValue} onChange={setDateValue} />}
          <button
            className={styles.confirmBtn}
            onClick={handleScheduleSubmit}
            disabled={submitDisabled}
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
