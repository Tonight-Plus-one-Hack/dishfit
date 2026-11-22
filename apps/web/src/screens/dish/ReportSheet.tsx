// "Wert melden": a bottom sheet to flag a wrong value. Saved on this device only, said so plainly.
import { useTranslation } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import type { Dish } from '../../data/contract'
import { REPORT_FIELDS, saveReport, type ReportField } from './breakdown'

export function ReportSheet({ dish, open, onClose }: { dish: Dish; open: boolean; onClose: () => void }) {
  const t = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const [field, setField] = useState<ReportField | null>(null)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setField(null)
      setNote('')
      setSent(false)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const submit = () => {
    if (!field) return
    saveReport({ dishId: dish.id, field, note: note.trim() })
    setSent(true)
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-labelledby="report-title"
    >
      {open && (
        <div className="sheet__panel" tabIndex={-1} autoFocus>
          <div className="sheet__grabber" aria-hidden="true" />
          <div className="sheet__head">
            <p className="t-label" id="report-title">{t('reportAValue')}</p>
            <button className="btn btn--ghost btn--icon sheet__close" onClick={onClose} aria-label={t('close')}>
              <Icon name="close" size={18} />
            </button>
          </div>
          {sent ? (
            <div className="report-done" role="status">
              <span className="report-done__check" aria-hidden="true">
                <Icon name="check" size={22} strokeWidth={2} />
              </span>
              <h2 className="t-feature">{t('thanks')}</h2>
              <p className="t-muted">{t('yourReportIsSavedOnThis')}</p>
              <button className="btn btn--primary btn--wide" onClick={onClose}>{t('done')}</button>
            </div>
          ) : (
            <form
              className="report-form"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <h2 className="report-form__title">{t('reportedDishName', dish.name)}</h2>
              <fieldset className="report-form__options">
                <legend className="sr-only">{t('whatsWrong')}</legend>
                {REPORT_FIELDS.map((f) => (
                  <label key={f.key} className="report-option">
                    <input type="radio" name="field" value={f.key} checked={field === f.key} onChange={() => setField(f.key)} />
                    <span>{f.label}</span>
                  </label>
                ))}
              </fieldset>
              <label className="report-form__note">
                <span className="t-label">{t('whatsCorrectOptional')}</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('forExampleNowCosts1250')}
                />
              </label>
              <button className="btn btn--primary btn--wide" type="submit" disabled={!field}>{t('saveReport')}</button>
              <p className="report-form__fine t-muted">{t('forNowTheReportIsOnly')}</p>
            </form>
          )}
        </div>
      )}
    </dialog>
  )
}
