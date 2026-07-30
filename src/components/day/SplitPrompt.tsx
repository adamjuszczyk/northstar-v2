import { useT } from '../../i18n'
import styles from './SplitPrompt.module.css'

interface Props {
  /** The selections that are already scheduled today. */
  items:     { id: string; label: string }[]
  onConfirm: () => void
  onCancel:  () => void
  isPending: boolean
}

/**
 * "Already on this day — Split instead?" confirmation (SPEC §5.3). Shown
 * when DayItemForm's tree/inbox/habit picker selection includes something
 * already scheduled today — adding it again offers a second, lightweight
 * occurrence of the same shared task rather than creating an independent
 * duplicate. Cancelling adds nothing from the conflicting selection; any
 * other, not-yet-scheduled selections in the same batch are unaffected.
 */
export default function SplitPrompt({ items, onConfirm, onCancel, isPending }: Props) {
  const t = useT()
  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.modal} role="alertdialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.modeLabel}>{t('day.splitPromptModeLabel')}</span>
        </div>
        <div className={styles.body}>
          <p className={styles.hint}>
            {items.length === 1 ? t('day.splitPromptHintSingle') : t('day.splitPromptHintMultiple')}
          </p>
          <ul className={styles.list}>
            {items.map(i => <li key={i.id} className={styles.item}>{i.label}</li>)}
          </ul>
        </div>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={isPending}>{t('common.cancel')}</button>
          <button className={styles.splitBtn} onClick={onConfirm} disabled={isPending}>
            {isPending ? '…' : t('day.splitConfirmButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
