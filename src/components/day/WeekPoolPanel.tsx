import { useState, useEffect, useRef, useMemo } from 'react'
import { format, parseISO, addDays, isToday } from 'date-fns'
import { useWeekFocus } from '../../hooks/useWeekFocus'
import type { WeekFocusItem } from '../../hooks/useWeekFocus'
import { usePullWeekFocusToDay } from '../../hooks/useDayItems'
import { useRangeDayItems } from '../../hooks/useDayItemsSummary'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits } from '../../hooks/useHabits'
import { weekStart } from '../../lib/dates'
import styles from './WeekPoolPanel.module.css'

const SOURCE_TAG: Record<WeekFocusItem['source'], string> = {
  standalone: '• STANDALONE',
  tree:       '✦ GOAL TREE',
  inbox:      '⌵ FROM INBOX',
  habit:      '◆ HABIT',
}

interface Props {
  date: string   // the day view's currently displayed date
}

export default function WeekPoolPanel({ date }: Props) {
  const wkStart = weekStart(date)
  const weekEnd = format(addDays(parseISO(wkStart), 6), 'yyyy-MM-dd')
  const isTodayDate = isToday(parseISO(date))

  const { data: focusItems = [], isLoading } = useWeekFocus(wkStart)
  const { data: rangeItems = [] } = useRangeDayItems(wkStart, weekEnd)
  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()
  const { data: habits     = [] } = useHabits()
  const { mutate: pullToDay, isPending } = usePullWeekFocusToDay()

  const [expanded, setExpanded] = useState(false)
  const initialised = useRef(false)
  useEffect(() => {
    if (initialised.current || isLoading) return
    initialised.current = true
    setExpanded(focusItems.length > 0)
  }, [isLoading, focusItems.length])

  const nodeMap  = useMemo(() => new Map(treeNodes.map(n => [n.id, n])), [treeNodes])
  const inboxMap = useMemo(() => new Map(inboxItems.map(i => [i.id, i])), [inboxItems])
  const habitMap = useMemo(() => new Map(habits.map(h => [h.id, h])), [habits])

  // focusId → the dates it's already been pulled to, this week.
  const pulledMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const item of rangeItems) {
      if (!item.originWeekFocusId) continue
      const list = map.get(item.originWeekFocusId)
      if (list) list.push(item.date)
      else map.set(item.originWeekFocusId, [item.date])
    }
    return map
  }, [rangeItems])

  function displayTitle(item: WeekFocusItem): string {
    if (item.title) return item.title
    if (item.treeNodeId)  return nodeMap.get(item.treeNodeId)?.title ?? '(untitled)'
    if (item.habitId)     return habitMap.get(item.habitId)?.name ?? '(untitled)'
    if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? '(untitled)'
    return '(untitled)'
  }

  function handlePull(item: WeekFocusItem) {
    pullToDay({
      weekFocusId: item.id,
      date,
      source:      item.source,
      title:       item.title,
      treeNodeId:  item.treeNodeId,
      inboxItemId: item.inboxItemId,
      habitId:     item.habitId,
    })
  }

  if (isLoading) return null

  return (
    <div className={styles.panel}>
      <button
        className={styles.header}
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className={styles.headerDot} />
        <span className={styles.headerTitle}>THIS WEEK</span>
        <span className={styles.headerCount}>· {focusItems.length}</span>
        <span className={styles.headerSpacer} />
        <span className={`${styles.chevron}${expanded ? ' ' + styles.chevronOpen : ''}`}>⌄</span>
      </button>

      {expanded && (
        <div className={styles.list}>
          {focusItems.length === 0 && (
            <p className={styles.emptyHint}>Nothing flagged for this week yet.</p>
          )}
          {focusItems.map(item => {
            const pulledDates = pulledMap.get(item.id) ?? []
            const isPulled = pulledDates.length > 0
            const dayLabels = pulledDates
              .map(d => format(parseISO(d), 'EEE').toUpperCase())
              .join(', ')
            return (
              <div key={item.id} className={`${styles.row}${isPulled ? ' ' + styles.rowPulled : ''}`}>
                <span className={styles.rowTag}>{SOURCE_TAG[item.source]}</span>
                <span className={styles.rowTitle}>{displayTitle(item)}</span>
                {isPulled ? (
                  <span className={styles.pulledTag}>→ {dayLabels}</span>
                ) : (
                  <button
                    className={styles.pullBtn}
                    onClick={() => handlePull(item)}
                    disabled={isPending}
                  >
                    + {isTodayDate ? 'Pull to today' : 'Pull here'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
