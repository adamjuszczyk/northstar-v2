import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHabits, useHabitEntries } from '../../hooks/useHabits'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import HabitCard from './HabitCard'
import HabitModal, { type HabitModalState } from './HabitModal'
import styles from './HabitsView.module.css'

export default function HabitsView() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')

  const { data: habits = [], isLoading, error } = useHabits()
  const { data: entries = [] } = useHabitEntries()
  const { data: treeNodes = [] } = useTreeNodes()
  const [modalState, setModalState] = useState<HabitModalState | null>(null)

  const nodeMap = new Map(treeNodes.map(n => [n.id, n]))
  const buildHabits  = habits.filter(h => h.mode === 'build')
  const reduceHabits = habits.filter(h => h.mode === 'reduce')

  useEffect(() => {
    if (!highlightId) return
    const el = document.getElementById(`habit-${highlightId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightId, habits.length])

  const errorMsg = error ? ((error as { message?: string }).message ?? 'Unknown error') : null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <p className={styles.pageTitle}>HABITS</p>
        <button className={styles.addBtn} onClick={() => setModalState({ mode: 'create' })}>
          + Add habit
        </button>
      </div>

      {errorMsg ? (
        <div className={styles.errorState}>
          <p className={styles.errorText}>Failed to load habits</p>
          <p className={styles.errorHint}>{errorMsg}</p>
        </div>
      ) : isLoading ? (
        <div className={styles.loading}><span className={styles.loadingStar}>✦</span></div>
      ) : habits.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No habits yet</p>
          <p className={styles.emptyHint}>Track something you want to build up, or cut back on.</p>
          <button className={styles.emptyBtn} onClick={() => setModalState({ mode: 'create' })}>
            + Add your first habit
          </button>
        </div>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={`${styles.sectionDot} ${styles.sectionDotBuild}`} />
              <span className={styles.sectionLabel}>BUILD · do more</span>
            </div>
            {buildHabits.length === 0 ? (
              <p className={styles.sectionEmpty}>Nothing here yet.</p>
            ) : (
              <div className={styles.grid}>
                {buildHabits.map(h => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    allEntries={entries}
                    treeNodeTitle={h.treeNodeId ? nodeMap.get(h.treeNodeId)?.title ?? null : null}
                    onEdit={() => setModalState({ mode: 'edit', habit: h })}
                    highlighted={highlightId === h.id}
                  />
                ))}
              </div>
            )}
          </section>

          <div className={styles.divider} />

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={`${styles.sectionDot} ${styles.sectionDotReduce}`} />
              <span className={styles.sectionLabel}>REDUCE · do less</span>
            </div>
            {reduceHabits.length === 0 ? (
              <p className={styles.sectionEmpty}>Nothing here yet.</p>
            ) : (
              <div className={styles.grid}>
                {reduceHabits.map(h => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    allEntries={entries}
                    treeNodeTitle={h.treeNodeId ? nodeMap.get(h.treeNodeId)?.title ?? null : null}
                    onEdit={() => setModalState({ mode: 'edit', habit: h })}
                    highlighted={highlightId === h.id}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {modalState && (
        <HabitModal state={modalState} onClose={() => setModalState(null)} />
      )}
    </div>
  )
}
