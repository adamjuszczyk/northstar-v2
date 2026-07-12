import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useLogHabitEntry, computeHabitStatus, computeCurrentMetric,
  type Habit, type HabitEntry, type HabitStatus,
} from '../../hooks/useHabits'
import TrendChart from './TrendChart'
import styles from './HabitCard.module.css'

const STATUS_LABEL: Record<HabitStatus, string> = {
  early:      'EARLY',
  good:       'GOOD',
  struggling: 'STRUGGLING',
}

interface Props {
  habit:         Habit
  allEntries:    HabitEntry[]   // every entry for every habit — filtered internally
  treeNodeTitle: string | null
  onEdit:        () => void
  highlighted:   boolean
}

export default function HabitCard({ habit, allEntries, treeNodeTitle, onEdit, highlighted }: Props) {
  const navigate = useNavigate()
  const { mutate: logEntry, isPending } = useLogHabitEntry()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note,     setNote]     = useState('')

  const entries = allEntries.filter(e => e.habitId === habit.id)
  const status  = computeHabitStatus(habit, allEntries)
  const metric  = computeCurrentMetric(habit, allEntries)

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
          <span className={styles.autoBadge}>AUTO · {habit.autoAddTo.toUpperCase()}</span>
        )}
      </div>

      {treeNodeTitle && (
        <button
          className={styles.treeLink}
          onClick={() => navigate(`/tree?focus=${habit.treeNodeId}`)}
        >
          ✦ {treeNodeTitle}
        </button>
      )}

      <div className={styles.logRow}>
        <button className={styles.logBtn} onClick={handleLog} disabled={isPending}>
          {isPending ? '…' : '+ Log'}
        </button>
        <button
          className={styles.noteToggle}
          onClick={() => setNoteOpen(o => !o)}
          aria-label={noteOpen ? 'Hide note' : 'Add note'}
          aria-expanded={noteOpen}
        >
          {noteOpen ? '−' : '+'} note
        </button>
        <button className={styles.editBtn} onClick={onEdit}>Edit</button>
      </div>

      {noteOpen && (
        <input
          className={styles.noteInput}
          placeholder="Optional note for the next log…"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleLog() }}
        />
      )}
    </div>
  )
}
