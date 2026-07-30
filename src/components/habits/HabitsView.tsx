import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHabits, useHabitEntries } from '../../hooks/useHabits'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useT } from '../../i18n'
import HabitCard from './HabitCard'
import HabitModal, { type HabitModalState } from './HabitModal'
import styles from './HabitsView.module.css'

export default function HabitsView() {
  const t = useT()
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

  const errorMsg = error ? ((error as { message?: string }).message ?? t('common.unknownError')) : null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <p className={styles.pageTitle}>{t('day.habitsLabel')}</p>
        <button className={styles.addBtn} onClick={() => setModalState({ mode: 'create' })}>
          {t('habits.addHabitButton')}
        </button>
      </div>

      {errorMsg ? (
        <div className={styles.errorState}>
          <p className={styles.errorText}>{t('habits.loadError')}</p>
          <p className={styles.errorHint}>{errorMsg}</p>
        </div>
      ) : isLoading ? (
        <div className={styles.loading}><span className={styles.loadingStar}>✦</span></div>
      ) : habits.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('habits.emptyTitle')}</p>
          <p className={styles.emptyHint}>{t('habits.emptyHint')}</p>
          <button className={styles.emptyBtn} onClick={() => setModalState({ mode: 'create' })}>
            {t('habits.addFirstHabitButton')}
          </button>
        </div>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={`${styles.sectionDot} ${styles.sectionDotBuild}`} />
              <span className={styles.sectionLabel}>{t('habits.buildSectionLabel')}</span>
            </div>
            {buildHabits.length === 0 ? (
              <p className={styles.sectionEmpty}>{t('habits.sectionEmpty')}</p>
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
              <span className={styles.sectionLabel}>{t('habits.reduceSectionLabel')}</span>
            </div>
            {reduceHabits.length === 0 ? (
              <p className={styles.sectionEmpty}>{t('habits.sectionEmpty')}</p>
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
