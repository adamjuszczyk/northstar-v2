import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useLogHabitEntry, computeHabitStatus, computeCurrentMetric,
  type Habit, type HabitEntry, type HabitStatus,
} from '../../hooks/useHabits'
import { useT } from '../../i18n'
import TrendChart from './TrendChart'
import styles from './HabitCard.module.css'

interface Props {
  habit:         Habit
  allEntries:    HabitEntry[]   // every entry for every habit — filtered internally
  treeNodeTitle: string | null
  onEdit:        () => void
  highlighted:   boolean
}

export default function HabitCard({ habit, allEntries, treeNodeTitle, onEdit, highlighted }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const { mutate: logEntry, isPending } = useLogHabitEntry()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note,     setNote]     = useState('')

  const STATUS_LABEL: Record<HabitStatus, string> = {
    early:      t('habits.statusEarly'),
    good:       t('habits.statusGood'),
    struggling: t('habits.statusStruggling'),
  }

  const entries = allEntries.filter(e => e.habitId === habit.id)
  const status  = computeHabitStatus(habit, allEntries)
  const metric  = computeCurrentMetric(habit, allEntries, t)

  function handleLog() {
    if (isPending) return
    logEntry({ habitId: habit.id, note: noteOpen && note.trim() ? note.trim() : null }, {
      onSuccess: () => setNote(''),
    })
  }

  return (
    <div
      id={`habit-${habit.id}`}
      className={`${styles.card}${highlighted ? ' ' + styles.cardHighlighted : ''}`}
    >
      <div className={styles.head}>
        <span className={styles.name} onDoubleClick={onEdit}>{habit.name}</span>
        <span className={`${styles.statusBadge} ${styles['status_' + status]}`}>{STATUS_LABEL[status]}</span>
      </div>

      <TrendChart mode={habit.mode} entries={entries} />

      <div className={styles.metaRow}>
        <span className={styles.metric}>{metric}</span>
        {/* Reduce habits carry no schedule — ignore any stale auto-add data
            left over from before this mode existed. */}
        {habit.mode === 'build' && habit.autoAdd && habit.autoAddTo && (
          <span className={styles.autoBadge}>{t('habits.autoBadge', { target: t(
            habit.autoAddTo === 'day' ? 'nav.day' : habit.autoAddTo === 'week' ? 'nav.week' : 'nav.month'
          ).toUpperCase() })}</span>
        )}
      </div>

      {treeNodeTitle && (
        <button
          className={styles.treeLink}
          onClick={() => navigate(`/tree?focus=${habit.treeNodeId}`)}
        >
          {t('habits.treeNodeLink', { title: treeNodeTitle })}
        </button>
      )}

      <div className={styles.logRow}>
        <button className={styles.logBtn} onClick={handleLog} disabled={isPending}>
          {isPending ? '…' : t('habits.logButton')}
        </button>
        <button
          className={styles.noteToggle}
          onClick={() => setNoteOpen(o => !o)}
          aria-label={noteOpen ? t('habits.hideNoteLabel') : t('habits.addNoteLabel')}
          aria-expanded={noteOpen}
        >
          {t('habits.noteToggleButton', { symbol: noteOpen ? '−' : '+' })}
        </button>
        <button className={styles.editBtn} onClick={onEdit}>{t('common.edit')}</button>
      </div>

      {noteOpen && (
        <input
          className={styles.noteInput}
          placeholder={t('habits.notePlaceholder')}
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleLog() }}
        />
      )}
    </div>
  )
}
