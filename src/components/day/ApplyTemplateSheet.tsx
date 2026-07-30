import { useState, useEffect } from 'react'
import { useDayTemplates, useApplyDayTemplate } from '../../hooks/useDayTemplates'
import { useLines } from '../../hooks/useLines'
import { useBlocks } from '../../hooks/useBlocks'
import TemplateEditor from '../templates/TemplateEditor'
import { useT } from '../../i18n'
import styles from './ApplyTemplateSheet.module.css'

interface Props {
  date:    string
  onClose: () => void
}

/**
 * Day-view entry point for applying a Day Template (SPEC section 5.4).
 * Applying always merges — it appends the template's lines/blocks alongside
 * whatever is already on the day, never deleting or replacing anything.
 * There is deliberately no "replace existing" mode and no confirmation
 * step; the note below is informational only.
 *
 * Also the Day/Planner-side entry point for *creating* a template (SPEC
 * §5.4: "creating a new template must also be reachable directly from
 * that same Day/Planner entry point — not only from Settings"). Creating
 * swaps this sheet's own modal out for TemplateEditor's — a single modal
 * on screen at a time, not stacked — reusing TemplateEditor exactly as
 * TemplateList.tsx does. Closing TemplateEditor returns here, where the
 * new template already shows thanks to its own query invalidation.
 */
export default function ApplyTemplateSheet({ date, onClose }: Props) {
  const t = useT()
  const { data: templates = [], isLoading } = useDayTemplates()
  const { data: lines  = [] } = useLines(date)
  const { data: blocks = [] } = useBlocks(date)
  const { mutate: applyTemplate, isPending } = useApplyDayTemplate()
  const [error, setError] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleApply(templateId: string) {
    if (isPending) return
    setError(null)
    applyTemplate(
      { templateId, date },
      { onSuccess: onClose, onError: e => setError((e as Error).message) },
    )
  }

  if (creatingNew) {
    return <TemplateEditor templateId={null} onClose={() => setCreatingNew(false)} />
  }

  const dayHasContent = lines.length + blocks.length > 0

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>{t("templates.applyTemplateHeader")}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>

        <div className={styles.body}>
          {isLoading ? (
            <p className={styles.hint}>{t("common.loading")}</p>
          ) : templates.length === 0 ? (
            <p className={styles.hint}>{t("templates.noTemplatesEmptyState")}</p>
          ) : (
            <>
              {dayHasContent && (
                <p className={styles.note}>
                  {t("templates.applyMergeNote")}
                </p>
              )}
              <div className={styles.list}>
                {templates.map(template => (
                  <div key={template.id} className={styles.row}>
                    <span className={styles.name}>{template.name}</span>
                    <button
                      className={styles.applyBtn}
                      onClick={() => handleApply(template.id)}
                      disabled={isPending}
                    >
                      {isPending ? t("common.pendingEllipsis") : t("templates.applyButton")}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button className={styles.newTemplateBtn} onClick={() => setCreatingNew(true)}>
            {t("templates.newTemplateButton")}
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <span className={styles.actionsSpacer} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>{t("common.close")}</button>
        </div>

      </div>
    </div>
  )
}
