// Bottom share sheet: native share, WhatsApp and copy link. Opens as a modal <dialog>.
import { useTranslation } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { MOTION } from '../lib/motion'
import { sharedUrl } from '../lib/share'
import { Icon, WhatsAppGlyph } from './Icon'
import './share.css'

export interface ShareTarget {
  title: string
  text: string
  url: string
  image?: string
  meta?: string
}

export function ShareActions({ target, onShared }: { target: ShareTarget; onShared?: () => void }) {
  const t = useTranslation()
  const [copied, setCopied] = useState(false)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    const url = sharedUrl(target.url, 'copy')
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.append(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), MOTION.copiedMs)
  }
  const nativeShare = async () => {
    try {
      await navigator.share({ title: target.title, text: target.text, url: sharedUrl(target.url, 'native') })
      onShared?.()
    } catch {
      // Dismissed by the user: stay where we are.
    }
  }
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${target.text} ${sharedUrl(target.url, 'whatsapp')}`)}`

  return (
    <div className="share__actions">
      {canNativeShare && (
        <button className="share__action" onClick={nativeShare}>
          <span className="icon-badge">
            <Icon name="share" size={18} />
          </span>
          <span>{t('sharing')}</span>
        </button>
      )}
      <a className="share__action" href={whatsapp} target="_blank" rel="noreferrer">
        <span className="icon-badge">
          <WhatsAppGlyph size={18} />
        </span>
        <span>{t('whatsapp')}</span>
      </a>
      <button className="share__action" onClick={copy} aria-live="polite">
        <span className="icon-badge">
          <Icon name={copied ? 'check' : 'link'} size={18} />
        </span>
        <span>{copied ? t('copied') : t('copyLink')}</span>
      </button>
    </div>
  )
}

export function ShareSheet({ target, onClose }: { target: ShareTarget | null; onClose: () => void }) {
  const t = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (target && !dialog.open) dialog.showModal()
    if (!target && dialog.open) dialog.close()
  }, [target])

  if (!target) return <dialog ref={ref} className="share" onClose={onClose} />

  return (
    <dialog
      ref={ref}
      className="share"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-labelledby="share-title"
    >
      <div className="share__panel" tabIndex={-1} autoFocus>
        <div className="share__grabber" aria-hidden="true" />
        <div className="share__head">
          <p className="t-label" id="share-title">{t('share')}</p>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label={t('close')}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="share__preview">
          {target.image && <img src={target.image} alt="" className="share__thumb" />}
          <div className="share__preview-text">
            <p className="share__title">{target.title}</p>
            {target.meta && <p className="t-label">{target.meta}</p>}
            <p className="share__url">{target.url.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>
        <ShareActions key={target.url} target={target} onShared={onClose} />
      </div>
    </dialog>
  )
}
