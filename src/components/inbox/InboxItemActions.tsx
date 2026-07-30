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
import { useT } from '../../i18n'
import WeekPicker from '../pickers/WeekPicker'
import DayPicker from '../pickers/DayPicker'
import MonthPicker from '../pickers/MonthPicker'
import styles from './InboxItemActions.module.css'

type ScheduleTarget = 'day' | 'week' | 'month' | null

function getQuickOptions(t: ReturnType<typeof useT>): Record<'day' | 'week' | 'month', { label: string; value: () => string }[]> {
  return {
    day: [
      { label: t('nav.today'),    value: () => todayISO() },
      { label: t('inbox.scheduleQuickTomorrow'), value: () => toISODate(addDays(new Date(), 1)) },
    ],
    week: [
      { label: t('day.tabThisWeek'), value: () => weekStart(new Date()) },
      { label: t('inbox.scheduleQuickNextWeek'), value: () => weekStart(addDays(new Date(), 7)) },
    ],
    month: [
      { label: t('day.tabThisMonth'), value: () => monthStart(new Date()) },
      { label: t('inbox.scheduleQuickNextMonth'), value: () => monthStart(addMonths(new Date(), 1)) },
    ],
  }
}

interface Props {
  item:      InboxItem
  onPromote: () => void
  onEdit:    () => void
  onClose:   () => void
}

export default function InboxItemActions({ item, onPromote, onEdit, onClose }: Props) {
  const t = useT()
  const QUICK_OPTIONS = getQuickOptions(t)
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
    const title = `${item.content.slice(0, 48)}${item.content.length > 48 ? '…' : ''}`
    if (!window.confirm(t('common.deleteConfirm', { title }))) return
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
          {t('inbox.promoteToTree')}
        </button>
        <button
          className={styles.actionBtn}
          style={{ '--btn-accent': 'var(--ns-project-accent)', '--btn-accent-rgb': 'var(--ns-project-accent-rgb)' } as CSSProperties}
          onClick={onEdit}
          disabled={isPending}
        >
          <span className={styles.btnIcon}>✎</span>
          {t('common.edit')}
        </button>
      </div>

      {/* Schedule actions */}
      <div className={styles.scheduleRow}>
        <span className={styles.scheduleLabel}>{t('inbox.scheduleToLabel')}</span>
        <div className={styles.scheduleBtns}>
          {(['day', 'week', 'month'] as const).map(target => (
            <button
              key={target}
              className={`${styles.scheduleChip}${scheduleTarget === target ? ' ' + styles.scheduleChipActive : ''}`}
              onClick={() => openSchedule(target)}
              disabled={isPending}
            >
              {target === 'day' ? t('inbox.scheduleTargetDay') : target === 'week' ? t('inbox.scheduleTargetWeek') : t('inbox.scheduleTargetMonth')}
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
          {t('common.delete')}
        </button>
      </div>
    </div>
  )
}
