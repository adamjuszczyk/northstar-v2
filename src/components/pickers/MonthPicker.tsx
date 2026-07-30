import { useState } from 'react'
import { useT, type Key } from '../../i18n'
import styles from './MonthPicker.module.css'

const MONTHS: { labelKey: Key }[] = [
  { labelKey: 'common.monthJan' },
  { labelKey: 'common.monthFeb' },
  { labelKey: 'common.monthMar' },
  { labelKey: 'common.monthApr' },
  { labelKey: 'common.monthMay' },
  { labelKey: 'common.monthJun' },
  { labelKey: 'common.monthJul' },
  { labelKey: 'common.monthAug' },
  { labelKey: 'common.monthSep' },
  { labelKey: 'common.monthOct' },
  { labelKey: 'common.monthNov' },
  { labelKey: 'common.monthDec' },
]

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
  const t = useT()
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
          aria-label={t('pickers.previousYear')}
        >‹</button>
        <span className={styles.headerLabel}>{viewYear}</span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setViewYear(y => y + 1)}
          aria-label={t('pickers.nextYear')}
        >›</button>
      </div>

      <div className={styles.grid}>
        {MONTHS.map(({ labelKey }, i) => {
          const monthNum    = i + 1
          const isSelected  = viewYear === selYear && monthNum === selMonth && !!value
          const isThisMonth = viewYear === now.getFullYear() && monthNum === now.getMonth() + 1
          return (
            <button
              key={labelKey}
              type="button"
              className={cx(styles.cell, isSelected && styles.cellSelected, isThisMonth && styles.cellToday)}
              onClick={() => onChange(`${viewYear}-${pad2(monthNum)}`)}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
