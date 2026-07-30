import { useT } from '../../i18n'
import styles from './ListBadge.module.css'

interface Props {
  done:  number
  total: number
}

/** Glanceable "list" indicator (SPEC §5.3) — icon + step count ("1/3"),
 *  shown wherever a day item (or focus row) renders, so a list task reads
 *  as one without opening it. Callers gate rendering on total >= 2 — a
 *  plain (1-step) task isn't a "list" per SPEC's own definition. */
export default function ListBadge({ done, total }: Props) {
  const t = useT()
  return (
    <span className={styles.badge} title={t('day.listBadgeTitle', { done, total, count: total })}>
      ☰ {done}/{total}
    </span>
  )
}
