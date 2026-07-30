import type { CSSProperties } from 'react'
import { timeStrToY } from '../../hooks/useDayItems'
import type { Line } from '../../hooks/useLines'
import styles from './DayTimeline.module.css'

const RAIL_X    = 62
const CARD_LEFT = 86
const CARD_RIGHT = 16

interface Props {
  line:   Line
  onEdit: (line: Line) => void
}

/** A named marker at a fixed time — purely visual, no checkbox, no content,
 *  not a container (SPEC §5.1). Click to edit. */
export default function LineMarker({ line, onEdit }: Props) {
  const top    = timeStrToY(line.time)
  const accent = line.colour ?? undefined

  return (
    <div className={styles.lineRow} style={{ top } as CSSProperties}>
      <span
        className={styles.lineDash}
        style={{
          left: RAIL_X + 4, right: CARD_RIGHT,
          ...(accent ? { background: accent, opacity: 0.85 } : {}),
        } as CSSProperties}
      />
      <button
        type="button"
        className={styles.lineLabel}
        style={{
          left: CARD_LEFT,
          ...(accent ? { color: accent, borderColor: accent } : {}),
        } as CSSProperties}
        onClick={() => onEdit(line)}
      >
        <span className={styles.lineTime}>{line.time}</span> {line.label}
      </button>
    </div>
  )
}
