import { useState, useEffect } from 'react'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useMonthFocus } from '../../hooks/useMonthFocus'
import type { MonthFocusItem } from '../../hooks/useMonthFocus'
import { useT } from '../../i18n'
import TreeNodePicker from '../pickers/TreeNodePicker'
import styles from './TaskSourceForm.module.css'

type Tab = 'tree' | 'inbox' | 'month'

/** One month task selected on the "from month" tab — carries its task_id
 *  through directly when it has one (the same shared identity now appears
 *  in both Month and Week), or falls back to its title when it doesn't (a
 *  plain, never-linked quick-add month task). */
export interface MonthTaskPick {
  taskId: string | null
  title:  string | null
}

interface Props {
  label:          string            // e.g. "ADD TASK — THIS WEEK"
  onClose:        () => void
  /** Selected tree node ids — the caller resolves each to a real task_id
   *  (find-or-create), not a copied title (Phase 4 fix). */
  onAddFromTree:  (treeNodeIds: string[]) => void
  /** Selected inbox item ids — same live-link resolution as tree. */
  onAddFromInbox: (inboxItemIds: string[]) => void
  isSaving:       boolean
  /** Week only — enables a third "From month" tab pulling this month's
   *  standalone Tasks-section items into the week. */
  monthStart?:     string
  onAddFromMonth?: (items: MonthTaskPick[]) => void
}

/**
 * Multi-select picker for the Tasks-section "add from tree/inbox(/month)"
 * flow (SPEC §5.6). Links via a real ns_tasks task_id rather than copying
 * title text (Phase 4 fix, carried forward from the Phase 1 workaround
 * flagged in CONTEXT.md) — the caller resolves ids to task links so this
 * section still stays classified under "Tasks" rather than "Goals" (both
 * sections split purely on the focus row's own `source`, which stays
 * 'standalone' for a task-linked row too; the task's OWN source carries the
 * real tree/inbox provenance for completion propagation and badge display).
 */
export default function TaskSourceForm({
  label, onClose, onAddFromTree, onAddFromInbox, isSaving, monthStart, onAddFromMonth,
}: Props) {
  const [tab, setTab] = useState<Tab>('tree')
  const [treeIds,  setTreeIds]  = useState<Set<string>>(new Set())
  const [inboxIds, setInboxIds] = useState<Set<string>>(new Set())
  const [monthIds, setMonthIds] = useState<Set<string>>(new Set())

  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()
  const { data: monthFocusItems = [] } = useMonthFocus(monthStart ?? '')
  const t = useT()

  const activeNodes = treeNodes.filter(n => n.status !== 'complete')
  // Only Tasks are schedulable — Notes never appear in any scheduling picker.
  const unassignedInbox = inboxItems.filter(i => i.state === 'unassigned' && i.kind === 'task')
  const monthTasks: MonthFocusItem[] = monthFocusItems.filter(
    i => i.source === 'standalone' && !i.isComplete,
  )
  const showMonthTab = monthStart !== undefined && onAddFromMonth !== undefined

  useEffect(() => {
    setTreeIds(new Set())
    setInboxIds(new Set())
    setMonthIds(new Set())
  }, [tab])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSet(next)
  }

  function isValid(): boolean {
    if (tab === 'tree')  return treeIds.size > 0
    if (tab === 'inbox') return inboxIds.size > 0
    if (tab === 'month') return monthIds.size > 0
    return false
  }

  function handleSubmit() {
    if (!isValid() || isSaving) return
    if (tab === 'tree') {
      onAddFromTree(Array.from(treeIds))
    } else if (tab === 'inbox') {
      onAddFromInbox(Array.from(inboxIds))
    } else if (tab === 'month' && onAddFromMonth) {
      const picks = Array.from(monthIds)
        .map(id => monthTasks.find(i => i.id === id))
        .filter((i): i is MonthFocusItem => !!i)
        .map(i => ({ taskId: i.taskId, title: i.title }))
      onAddFromMonth(picks)
    }
  }

  const selectedCount =
    tab === 'tree'  ? treeIds.size  :
    tab === 'inbox' ? inboxIds.size :
                       monthIds.size
  const addLabel = isSaving
    ? t('common.pendingEllipsis')
    : selectedCount > 0 ? t('common.addItemsCount', { n: selectedCount, count: selectedCount }) : t('common.add')

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.headerLabel}>✦ {label}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab}${tab === 'tree' ? ' ' + styles.tabActive : ''}`}
            onClick={() => setTab('tree')}
          >{t('day.tabFromTree')}</button>
          <button
            className={`${styles.tab}${tab === 'inbox' ? ' ' + styles.tabActive : ''}`}
            onClick={() => setTab('inbox')}
          >{t('day.tabFromInbox')}</button>
          {showMonthTab && (
            <button
              className={`${styles.tab}${tab === 'month' ? ' ' + styles.tabActive : ''}`}
              onClick={() => setTab('month')}
            >{t('planner.tabFromMonth')}</button>
          )}
        </div>

        {tab === 'tree' && (
          <div className={styles.body}>
            <label className={styles.fieldLabel}>{t('day.goalTreeNodesLabel')}</label>
            <TreeNodePicker
              nodes={activeNodes}
              selectedIds={treeIds}
              onToggleSelect={id => toggle(treeIds, setTreeIds, id)}
              emptyHint={t('planner.noActiveNodes')}
            />
          </div>
        )}

        {tab === 'inbox' && (
          <div className={styles.body}>
            <div className={styles.pickerHeaderRow}>
              <label className={styles.fieldLabel}>{t('day.unassignedInboxLabel')}</label>
              {inboxIds.size > 0 && <span className={styles.selectedCount}>{t('day.selectedCount', { n: inboxIds.size })}</span>}
            </div>
            <div className={styles.nodeList}>
              {unassignedInbox.length === 0 && <p className={styles.emptyHint}>{t('day.emptyUnassignedInbox')}</p>}
              {unassignedInbox.map(item => {
                const selected = inboxIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    className={`${styles.inboxRow}${selected ? ' ' + styles.inboxRowSelected : ''}`}
                    onClick={() => toggle(inboxIds, setInboxIds, item.id)}
                  >
                    <span className={`${styles.checkbox}${selected ? ' ' + styles.checkboxChecked : ''}`}>
                      {selected ? '✓' : ''}
                    </span>
                    <span className={styles.inboxContent}>{item.content}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'month' && showMonthTab && (
          <div className={styles.body}>
            <div className={styles.pickerHeaderRow}>
              <label className={styles.fieldLabel}>{t('planner.thisMonthsTasks')}</label>
              {monthIds.size > 0 && <span className={styles.selectedCount}>{t('day.selectedCount', { n: monthIds.size })}</span>}
            </div>
            <div className={styles.nodeList}>
              {monthTasks.length === 0 && <p className={styles.emptyHint}>{t('planner.noOpenTasksThisMonth')}</p>}
              {monthTasks.map(item => {
                const selected = monthIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    className={`${styles.inboxRow}${selected ? ' ' + styles.inboxRowSelected : ''}`}
                    onClick={() => toggle(monthIds, setMonthIds, item.id)}
                  >
                    <span className={`${styles.checkbox}${selected ? ' ' + styles.checkboxChecked : ''}`}>
                      {selected ? '✓' : ''}
                    </span>
                    <span className={styles.inboxContent}>{item.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isSaving}>{t('common.cancel')}</button>
          <button
            className={styles.saveBtn}
            onClick={handleSubmit}
            disabled={!isValid() || isSaving}
          >
            {addLabel}
          </button>
        </div>

      </div>
    </div>
  )
}
