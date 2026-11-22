// "Zum Home-Bildschirm": offered once, after the first meaningful action (lib/pwa.ts). Android and desktop
// Chrome show the browser's install prompt from our button; iOS Safari gets the two manual steps.
import { useTranslation } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { diaryStore } from '../lib/diary'
import { installHintDone, installHintKind, installPrompt, markInstallHintDone, MEANINGFUL_EVENT, type InstallHintKind } from '../lib/pwa'
import { savedStore } from '../lib/saved'
import { BrandMark } from '../app/desktop/BrandMark'
import { Icon } from './Icon'
import './install-hint.css'

/** Waits until no other dialog (e.g. the share sheet) is open, so the hint never stacks on top of one. */
function whenNoDialog(run: () => void): () => void {
  let timer = 0
  const check = () => {
    if (document.querySelector('dialog[open]')) timer = window.setTimeout(check, 800)
    else run()
  }
  timer = window.setTimeout(check, 900)
  return () => window.clearTimeout(timer)
}

export function InstallHint() {
  const t = useTranslation()
  const [kind, setKind] = useState<InstallHintKind>(null)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (installHintDone()) return
    let cancel = () => {}
    const offer = () => {
      if (installHintDone()) return
      cancel()
      cancel = whenNoDialog(() => {
        const next = installHintKind()
        if (next && !installHintDone()) {
          markInstallHintDone()
          setKind(next)
        }
      })
    }
    // Saving or logging a dish counts too; watched here so those features need no install code.
    const grew = (store: { get(): unknown[]; subscribe(l: () => void): () => void }) => {
      let size = store.get().length
      return store.subscribe(() => {
        const next = store.get().length
        if (next > size) offer()
        size = next
      })
    }
    const unsubscribe = [grew(savedStore), grew(diaryStore)]
    window.addEventListener(MEANINGFUL_EVENT, offer)
    return () => {
      cancel()
      unsubscribe.forEach((u) => u())
      window.removeEventListener(MEANINGFUL_EVENT, offer)
    }
  }, [])

  useEffect(() => {
    const dialog = ref.current
    if (dialog && kind && !dialog.open) dialog.showModal()
  }, [kind])

  const close = () => {
    ref.current?.close()
    setKind(null)
  }
  const install = async () => {
    const prompt = installPrompt()
    close()
    if (!prompt) return
    await prompt.prompt().catch(() => undefined)
  }

  if (!kind) return null

  return (
    <dialog
      ref={ref}
      className="share install-hint"
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      aria-labelledby="install-hint-title"
    >
      <div className="share__panel" tabIndex={-1} autoFocus>
        <div className="share__grabber" aria-hidden="true" />
        <div className="install-hint__head">
          <BrandMark size={52} />
          <div>
            <p className="install-hint__title" id="install-hint-title">{t('addDishfitToYourHomeScreen')}</p>
            <p className="install-hint__lede">{t('yourDishesAreOneTapAway')}</p>
          </div>
        </div>
        {kind === 'ios' ? (
          <ol className="install-hint__steps">
            <li>
              <span className="install-hint__num">1</span>
              <span>{t('inSafariTap')}{' '}<strong>{t('share')}</strong>
              </span>
              <span className="install-hint__glyph" aria-hidden="true">
                <Icon name="share" size={18} />
              </span>
            </li>
            <li>
              <span className="install-hint__num">2</span>
              <span>{t('choose')}{' '}<strong>{t('addToHomeScreen')}</strong>
              </span>
              <span className="install-hint__glyph" aria-hidden="true">
                <Icon name="plus" size={18} />
              </span>
            </li>
          </ol>
        ) : null}
        <div className="install-hint__actions">
          {kind === 'prompt' ? (
            <>
              <button className="btn btn--ghost" onClick={close}>{t('later')}</button>
              <button className="btn btn--primary" onClick={install}>{t('install')}</button>
            </>
          ) : (
            <button className="btn btn--primary" onClick={close}>{t('gotIt')}</button>
          )}
        </div>
      </div>
    </dialog>
  )
}
