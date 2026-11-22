// Share sheet for one dish: the story card the Worker renders, then share (with the card image where the
// browser can), WhatsApp, story download and copy link. Every action records a share (lib/share.ts).
import { useTranslation } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { MOTION } from '../lib/motion'
import { noteMeaningfulAction } from '../lib/pwa'
import { dishCardUrl, shareDish, type ShareChannel } from '../lib/share'
import { Icon, WhatsAppGlyph } from './Icon'
import './share.css'

export interface DishShareTarget {
  dishId: string
  name: string
  /** One line for chats, e.g. "Lass uns hier essen: ...". */
  text: string
  /** The dish page, without share parameters. */
  url: string
}

function fileName(name: string, type = 'image/jpeg'): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `dishfit-${slug || 'gericht'}-story.${type === 'image/png' ? 'png' : 'jpg'}`
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const input = document.createElement('input')
    input.value = text
    document.body.append(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }
}

function Actions({ target, story, onShared }: { target: DishShareTarget; story: File | null; onShared: () => void }) {
  const t = useTranslation()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const canNativeShare = typeof navigator.share === 'function'
  const link = (channel: ShareChannel) => {
    noteMeaningfulAction()
    return shareDish(target.dishId, channel, target.url)
  }

  const nativeShare = async () => {
    const url = link('native')
    // Apps like Instagram take the image; the link rides along in the text for the ones that drop url.
    const withFile = story && navigator.canShare?.({ files: [story] })
    try {
      await navigator.share(withFile ? { files: [story], text: `${target.text} ${url}` } : { title: target.name, text: target.text, url })
      onShared()
    } catch {
      // Dismissed: stay in the sheet.
    }
  }
  const whatsapp = () => {
    const url = link('whatsapp')
    window.open(`https://wa.me/?text=${encodeURIComponent(`${target.text} ${url}`)}`, '_blank', 'noopener')
  }
  const download = () => {
    link('story')
    const a = document.createElement('a')
    a.href = story ? URL.createObjectURL(story) : dishCardUrl(target.dishId, 'story', true)
    a.download = story ? story.name : fileName(target.name)
    document.body.append(a)
    a.click()
    a.remove()
    if (story) window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    setSaved(true)
    window.setTimeout(() => setSaved(false), MOTION.copiedMs)
  }
  const copy = async () => {
    await copyText(link('copy'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), MOTION.copiedMs)
  }

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
      <button className="share__action" onClick={whatsapp}>
        <span className="icon-badge">
          <WhatsAppGlyph size={18} />
        </span>
        <span>{t('whatsapp')}</span>
      </button>
      <button className="share__action" onClick={download} aria-live="polite">
        <span className="icon-badge">
          <Icon name={saved ? 'check' : 'download'} size={18} />
        </span>
        <span>{saved ? t('saved') : t('downloadStory')}</span>
      </button>
      <button className="share__action" onClick={copy} aria-live="polite">
        <span className="icon-badge">
          <Icon name={copied ? 'check' : 'link'} size={18} />
        </span>
        <span>{copied ? t('copied') : t('copyLink')}</span>
      </button>
    </div>
  )
}

export function DishShareSheet({ target, onClose }: { target: DishShareTarget | null; onClose: () => void }) {
  const t = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const [fetched, setFetched] = useState<{ dishId: string; file: File } | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const dishId = target?.dishId
  const name = target?.name
  const story = fetched && fetched.dishId === dishId ? fetched.file : null
  const loaded = loadedId !== null && loadedId === dishId

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (target && !dialog.open) dialog.showModal()
    if (!target && dialog.open) dialog.close()
  }, [target])

  // Fetch the story card as the sheet opens, so sharing it stays inside the tap (iOS requires that).
  useEffect(() => {
    if (!dishId || !name) return
    const controller = new AbortController()
    fetch(dishCardUrl(dishId, 'story'), { signal: controller.signal })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) setFetched({ dishId, file: new File([blob], fileName(name, blob.type), { type: blob.type || 'image/jpeg' }) })
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [dishId, name])

  if (!target) return <dialog ref={ref} className="share" onClose={onClose} />

  return (
    <dialog
      ref={ref}
      className="share"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-labelledby="dish-share-title"
    >
      <div className="share__panel" tabIndex={-1} autoFocus>
        <div className="share__grabber" aria-hidden="true" />
        <div className="share__head">
          <p className="t-label" id="dish-share-title">{t('shareDish')}</p>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label={t('close')}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <figure className={`share-card${loaded ? ' share-card--loaded' : ''}`}>
          <img
            src={dishCardUrl(target.dishId, 'story')}
            alt={t('storyCard1', target.name)}
            width={1080}
            height={1920}
            onLoad={() => setLoadedId(target.dishId)}
          />
        </figure>
        <Actions key={target.dishId} target={target} story={story} onShared={onClose} />
      </div>
    </dialog>
  )
}
