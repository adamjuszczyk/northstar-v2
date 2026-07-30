import { useState } from 'react'
import { useInboxItems } from '../../hooks/useInboxItems'
import InboxTasksSection from './InboxTasksSection'
import InboxNotesSection from './InboxNotesSection'
import { useT } from '../../i18n'
import styles from './InboxView.module.css'

type Tab = 'tasks' | 'notes'

/**
 * Thin shell — header + Tasks/Notes tab switcher (SPEC §6.3). Fetches once
 * here and splits by `kind` so both sections share one query rather than
 * each re-fetching. The Tasks badge always reflects the *full* unassigned
 * count regardless of which sub-filter is active inside InboxTasksSection —
 * a tab-level badge should say what needs attention across the whole
 * section, not go silently to zero because of an internal filter choice.
 */
export default function InboxView() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('tasks')
  const { data: items = [], isLoading, error } = useInboxItems()

  const tasks = items.filter(i => i.kind === 'task')
  const notes = items.filter(i => i.kind === 'note')
  const unassignedTaskCount = tasks.filter(i => i.state === 'unassigned' && !i.isCompleted).length

  const errorMsg = error ? ((error as { message?: string }).message ?? t("common.unknownError")) : null

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.star}>✦</span>
        <span className={styles.title}>{t("nav.inbox")}</span>
      </div>

      {/* Tasks / Notes tab switcher */}
      <div className={styles.tabBar} role="tablist" aria-label={t("inbox.sectionAriaLabel")}>
        <button
          role="tab"
          aria-selected={tab === 'tasks'}
          className={`${styles.tab}${tab === 'tasks' ? ' ' + styles.tabActive : ''}`}
          onClick={() => setTab('tasks')}
        >
          {t("inbox.tasksTabLabel")}
          {!isLoading && unassignedTaskCount > 0 && (
            <span className={styles.badge}>{unassignedTaskCount}</span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'notes'}
          className={`${styles.tab}${tab === 'notes' ? ' ' + styles.tabActive : ''}`}
          onClick={() => setTab('notes')}
        >
          {t("inbox.notesTabLabel")}
        </button>
      </div>

      {/* Active section */}
      {errorMsg ? (
        <p className={styles.error}>{errorMsg}</p>
      ) : tab === 'tasks' ? (
        <InboxTasksSection items={tasks} isLoading={isLoading} />
      ) : (
        <InboxNotesSection items={notes} isLoading={isLoading} />
      )}
    </div>
  )
}
