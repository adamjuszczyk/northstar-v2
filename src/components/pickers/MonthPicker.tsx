import { useState } from 'react'
import styles from './MonthPicker.module.css'

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function cx(...cs: (string | false | undefined | null)[]): string {
  return cs.filter(Boolean).join(' ')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

interface Props {
  /** Selected month, 'YYYY-MM', or empty string for no selection yet */
  value:    string
  onChange: (yearMonth: string) => void
}

export default function MonthPicker({ value, onChange }: Props) {
  const now = new Date()
  const [selYear, selMonth] = value ? value.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1]
  const [viewYear, setViewYear] = useState(selYear)

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setViewYear(y => y - 1)}
          aria-label="Previous year"
        >‹</button>
        <span className={styles.headerLabel}>{viewYear}</span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setViewYear(y => y + 1)}
          aria-label="Next year"
        >›</button>
      </div>

      <div className={styles.grid}>
        {MONTH_NAMES.map((name, i) => {
          const monthNum    = i + 1
          const isSelected  = viewYear === selYear && monthNum === selMonth && !!value
          const isThisMonth = viewYear === now.getFullYear() && monthNum === now.getMonth() + 1
          return (
            <button
              key={name}
              type="button"
              className={cx(styles.cell, isSelected && styles.cellSelected, isThisMonth && styles.cellToday)}
              onClick={() => onChange(`${viewYear}-${pad2(monthNum)}`)}
            >
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
