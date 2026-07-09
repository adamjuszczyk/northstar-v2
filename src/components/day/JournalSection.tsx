import { useState, useEffect, useRef } from 'react'
import { useJournalEntry, useSaveJournalEntry } from '../../hooks/useJournalEntry'
import { useIsMobile } from '../../hooks/useIsMobile'
import styles from './JournalSection.module.css'

const EXPANDED_LS_KEY = 'ns_journal_expanded'

function readExpandedPref(): boolean {
  try {
    return localStorage.getItem(EXPANDED_LS_KEY) === '1'
  } catch {
    return false
  }
}

interface Props {
  date: string
}

export default function JournalSection({ date }: Props) {
  const { data: entry, isSuccess } = useJournalEntry(date)
  const { mutate: save } = useSaveJournalEntry()
  const [value, setValue] = useState('')
  // Tracks which date's content is currently loaded into the textarea so a
  // background refetch (e.g. after save invalidates the query) can't stomp
  // on text the user is still typing.
  const loadedFor = useRef<string | null>(null)

  const isMobile = useIsMobile()
  // Mobile-only collapsible drawer, collapsed by default — meaningless on
  // desktop, where the textarea always renders regardless of this state.
  const [expanded, setExpanded] = useState(readExpandedPref)
  const showTextarea = !isMobile || expanded

  useEffect(() => {
    if (!isSuccess) return
    if (loadedFor.current !== date) {
      setValue(entry?.content ?? '')
      loadedFor.current = date
    }
  }, [date, entry, isSuccess])

  function handleBlur() {
    if (value === (entry?.content ?? '')) return
    save({ date, content: value })
  }

  function toggleExpanded() {
    if (!isMobile) return
    setExpanded(e => {
      const next = !e
      try {
        localStorage.setItem(EXPANDED_LS_KEY, next ? '1' : '0')
      } catch {
        // localStorage unavailable — collapse preference just won't persist
      }
      return next
    })
  }

  return (
    <div className={styles.section}>
      <button
        className={styles.header}
        onClick={toggleExpanded}
        aria-expanded={showTextarea}
        aria-label={isMobile ? (expanded ? "Collapse today's reflection" : "Expand today's reflection") : undefined}
      >
        <span className={styles.label}>Today's reflection</span>
        <span className={styles.headerSpacer} />
        {isMobile && (
          <span className={`${styles.chevron}${expanded ? ' ' + styles.chevronOpen : ''}`}>⌄</span>
        )}
      </button>
      {showTextarea && (
        <textarea
          className={styles.textarea}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={handleBlur}
          placeholder="Add a note for today…"
          rows={3}
        />
      )}
    </div>
  )
}
