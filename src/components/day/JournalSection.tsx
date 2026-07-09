import { useState, useEffect, useRef } from 'react'
import { useJournalEntry, useSaveJournalEntry } from '../../hooks/useJournalEntry'
import styles from './JournalSection.module.css'

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

  return (
    <div className={styles.section}>
      <span className={styles.label}>Today's reflection</span>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Add a note for today…"
        rows={3}
      />
    </div>
  )
}
