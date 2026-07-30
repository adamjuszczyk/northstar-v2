import type { Sheet } from '../../types'
import { useT } from '../../i18n'
import styles from './SheetTabs.module.css'

interface Props {
  sheets:        Sheet[]
  activeSheetId: string | null
  onSelect:      (id: string | null) => void
  onManage:      (sheet: Sheet) => void
  onCreateNew:   () => void
}

/** Tab strip above the tree canvas (SPEC §5.5) — Main Tree plus every
 *  Sheet, switchable. A sheet's own gear button opens SheetForm in manage
 *  mode (rename/attach/detach/dissolve); "+ Sheet" starts a fresh detached
 *  one. Always rendered, even with zero sheets yet, so "+ Sheet" stays a
 *  discoverable, permanent entry point. */
export default function SheetTabs({ sheets, activeSheetId, onSelect, onManage, onCreateNew }: Props) {
  const t = useT()
  return (
    <div className={styles.bar} role="tablist" aria-label={t('tree.sheetsTablistLabel')}>
      <button
        role="tab"
        aria-selected={activeSheetId === null}
        className={`${styles.tab}${activeSheetId === null ? ' ' + styles.tabActive : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className={styles.tabIcon}>✦</span>
        {t('tree.mainTreeTab')}
      </button>

      {sheets.map(s => (
        <div
          key={s.id}
          className={`${styles.tabWrap}${activeSheetId === s.id ? ' ' + styles.tabWrapActive : ''}`}
        >
          <button
            role="tab"
            aria-selected={activeSheetId === s.id}
            className={styles.tab}
            onClick={() => onSelect(s.id)}
          >
            <span className={styles.tabIcon}>{s.anchorNodeId ? '⧉' : '⧈'}</span>
            {s.name}
          </button>
          <button
            className={styles.manageBtn}
            onClick={() => onManage(s)}
            aria-label={t('tree.manageSheetAriaLabel', { name: s.name })}
            title={t('tree.manageSheetTitle')}
          >
            ⚙
          </button>
        </div>
      ))}

      <button className={styles.newBtn} onClick={onCreateNew}>
        {t('tree.addSheetButton')}
      </button>
    </div>
  )
}
