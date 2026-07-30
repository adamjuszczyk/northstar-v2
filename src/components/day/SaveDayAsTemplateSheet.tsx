import { useState, useEffect } from 'react'
import { useSaveDayAsTemplate } from '../../hooks/useDayTemplates'
import { useLines } from '../../hooks/useLines'
import { useBlocks } from '../../hooks/useBlocks'
import { useT } from '../../i18n'
import styles from './SaveDayAsTemplateSheet.module.css'

interface Props {
  date:    string
  onClose: () => void
}

/**
 * Day-view entry point for saving a day's current Lines + Blocks as a new
 * Day Template (SPEC section 5.4) — the reverse of ApplyTemplateSheet. A
 * one-time copy, same direction as applying a template is a one-time
 * stamp: nothing links the new template back to this day, so editing the
 * day afterward never touches the template it was saved from.
 */
export default function SaveDayAsTemplateSheet({ date, onClose }: Props) {
  const t = useT()
  const { data: lines  = [], refetch: refetchLines  } = useLines(date)
  const { data: blocks = [], refetch: refetchBlocks } = useBlocks(date)
  const { mutate: saveAsTemplate, isPending } = useSaveDayAsTemplate()
  const [name,  setName]  = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // useLines/useBlocks are 5-minute-staleTime caches, but the save mutation
  // always re-reads ns_lines/ns_blocks fresh -- force a fresh fetch on open
  // so the previewed "copies N lines and M blocks" count can't disagree
  // with a cross-device edit that landed inside that cache window.
  useEffect(() => {
    refetchLines()
    refetchBlocks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function isValid(): boolean {
    return name.trim().length > 0
  }

  function handleSave() {
    if (isPending || !isValid()) return
    setError(null)
    saveAsTemplate(
      { date, name: name.trim() },
      { onSuccess: onClose, onError: e => setError((e as Error).message) },
    )
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const dayHasContent = lines.length + blocks.length > 0

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>{t("templates.saveAsTemplateHeader")}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.note}>
            {dayHasContent
              ? t("templates.saveTemplateNoteWithContent", {
                  lines: t("templates.lineCount", { n: lines.length, count: lines.length }),
                  blocks: t("templates.blockCount", { n: blocks.length, count: blocks.length }),
                })
              : t("templates.saveTemplateNoteEmpty")}
          </p>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="save-tmpl-name">{t("common.nameLabel")}</label>
            <input
              id="save-tmpl-name"
              className={styles.input}
              placeholder={t("templates.namePlaceholder")}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              autoFocus
            />
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <span className={styles.actionsSpacer} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>{t("common.cancel")}</button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!isValid() || isPending}
          >
            {isPending ? t("common.pendingEllipsis") : t("common.save")}
          </button>
        </div>

      </div>
    </div>
  )
}
