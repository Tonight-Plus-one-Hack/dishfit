// Camera, standalone: photograph a plate (AI estimate straight into today) or a menu (AI reads the dishes,
// saved privately under "Meine Karten", optionally shared with the community through PR #33's upload).
// Phone: <input capture> opens the camera. Desktop: upload or drag and drop. Every number is a labelled AI estimate with a range.
import { dishDescription } from '../../lib/menu-copy'
import { localizedFormatter, useTranslation, translate } from '../../i18n'
import { lazy, Suspense, useEffect, useRef, useState, type DragEvent } from 'react'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { Icon } from '../../components/Icon'
import type { LatLng } from '../../data/contract'
import { createScan, livePhoto, ScanError, scanErrorMessage, shareMenu, type MenuDish, type MenuScan, type Nutrients, type PlateScan, type Scan } from '../../data/scans'
import { removeScanPhoto, saveCard } from '../../lib/cards'
import { logEstimate, type Estimate } from '../../lib/diary'
import { formatPrice } from '../../lib/format'
import { useSearchParams } from '../../lib/location'
import { BERLIN_CENTER } from '../../lib/geo'
import { Link } from '../../lib/router'
import { navigate, paths } from '../../lib/routes'
import { formatInt } from '../onboarding/targets'
import { PhotoError, preparePhoto, type PreparedPhoto } from '../../lib/photo'
import { submitErrorText } from '../snap/messages'
import './camera.css'

const PinMap = lazy(() => import('../snap/PinMap'))

type Kind = 'plate' | 'menu'

type Phase = { name: 'pick' } | { name: 'reading'; photo: PreparedPhoto } | { name: 'done'; photo: PreparedPhoto; scan: Scan } | { name: 'error'; text: () => string; photo: PreparedPhoto | null }

const COPY: Record<Kind, { title: string; body: string }> = {
  plate: { get title() { return translate('takeAPhotoOfYourMeal') }, get body() { return translate('aiEstimatesARangeForYour') } },
  menu: { get title() { return translate('takeAPhotoOfAMenu') }, get body() { return translate('aiReadsTheDishesAndEstimates') } },
}

export function CameraScreen() {
  const t = useTranslation()
  const params = useSearchParams()
  const kind: Kind = params.get('art') === 'karte' ? 'menu' : 'plate'
  const [phase, setPhase] = useState<Phase>({ name: 'pick' })
  const [dragging, setDragging] = useState(false)
  const run = useRef(0)

  // Object URLs of old previews are released.
  const photoUrl = phase.name === 'pick' ? null : phase.photo?.url
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl])

  const handle = async (file: File | undefined) => {
    if (!file) return
    const id = ++run.current
    let photo: PreparedPhoto
    try {
      photo = await preparePhoto(file)
    } catch (error) {
      setPhase({ name: 'error', text: () => (error instanceof PhotoError ? translate(error.key) : translate('weCouldntOpenThisImage')), photo: null })
      return
    }
    setPhase({ name: 'reading', photo })
    try {
      const scan = await createScan(kind, photo.blob)
      if (id !== run.current) return
      if (scan.kind === 'menu') saveCard(scan)
      setPhase({ name: 'done', photo, scan })
    } catch (error) {
      if (id !== run.current) return
      setPhase({ name: 'error', text: () => (error instanceof ScanError ? scanErrorMessage(error.status) : translate('cameraScreenSomethingWentWrong')), photo })
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void handle(e.dataTransfer.files[0])
  }

  return (
    <AppShell tab="today">
      <ScreenHeader title={t('camera')} backTo={paths.today()} />
      <div className="page camera">
        <div className="camera__kinds" role="tablist" aria-label={t('whatAreYouPhotographing')}>
          {(['plate', 'menu'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              className={`camera__kind ${kind === k ? 'is-active' : ''}`}
              onClick={() => {
                // A new kind starts over and drops a reading still in flight.
                run.current++
                setPhase({ name: 'pick' })
                navigate(paths.camera(k), { replace: true })
              }}
            >
              <Icon name={k === 'plate' ? 'plate' : 'list'} size={16} />
              {k === 'plate' ? t('meal') : t('menu')}
            </button>
          ))}
        </div>

        {phase.name === 'pick' || (phase.name === 'error' && !phase.photo) ? (
          <div
            className={`drop ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="drop__icon">
              <Icon name="camera" size={28} />
            </span>
            <h2 className="drop__title">{COPY[kind].title}</h2>
            <p className="drop__body">{COPY[kind].body}</p>
            <div className="drop__actions">
              <label className="btn btn--primary drop__btn">
                <Icon name="camera" size={16} />{t('takePhoto')}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
              </label>
              <label className="btn btn--secondary drop__btn">
                <Icon name="upload" size={16} />{t('uploadPhoto')}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
              </label>
            </div>
            <p className="drop__hint">{t('orDragAPhotoHereJpeg')}</p>
            {phase.name === 'error' && (
              <p className="camera__error" role="alert">
                <Icon name="alert" size={16} /> {phase.text()}
              </p>
            )}
          </div>
        ) : (
          <div className="camera__result">
            <figure className={`shot ${phase.name === 'reading' ? 'is-reading' : ''}`}>
              <img src={phase.photo!.url} alt={kind === 'plate' ? t('yourMeal') : t('yourMenu')} />
              {phase.name === 'reading' && (
                <figcaption className="shot__status" role="status">
                  <span className="shot__spinner" aria-hidden="true" />
                  {kind === 'plate' ? t('estimatingNutritionForYourMeal') : t('readingTheMenu')}
                </figcaption>
              )}
            </figure>
            <div className="camera__panel">
              {phase.name === 'error' && (
                <div className="camera__fail">
                  <p className="camera__error" role="alert">
                    <Icon name="alert" size={16} /> {phase.text()}
                  </p>
                  <button className="btn btn--secondary" onClick={() => setPhase({ name: 'pick' })}>{t('chooseAnotherPhoto')}</button>
                </div>
              )}
              {phase.name === 'reading' && <ResultSkeleton />}
              {phase.name === 'done' && phase.scan.kind === 'plate' && <PlateResult scan={phase.scan} onAgain={() => setPhase({ name: 'pick' })} />}
              {phase.name === 'done' && phase.scan.kind === 'menu' && <MenuResult scan={phase.scan} photo={phase.photo.blob} onAgain={() => setPhase({ name: 'pick' })} />}
            </div>
          </div>
        )}

        <p className="camera__fine">
          <Icon name="shieldCheck" size={14} />{t('thePhotoIsSentToThe')}</p>
      </div>
    </AppShell>
  )
}

// ---------- Results ----------

export function AiBadge() {
  const t = useTranslation()
  return (
    <span className="ai-badge">
      <Icon name="spark" size={12} strokeWidth={2} />{t('aiEstimate')}</span>
  )
}

const MACROS = [
  { key: 'protein', get label() { return translate('protein') } },
  { key: 'carbs', get label() { return translate('carbs') } },
  { key: 'fat', get label() { return translate('fat') } },
] as const

const estimateOf = (name: string, place: string, price: number | null, n: Nutrients): Estimate => ({
  name,
  place,
  price,
  kcal: n.kcal.value,
  protein: n.protein.value,
  carbs: n.carbs.value,
  fat: n.fat.value,
  range: { low: n.kcal.low, high: n.kcal.high },
})

const CONFIDENCE = { get low() { return translate('uncertain') }, get medium() { return translate('mediumConfidence') }, get high() { return translate('fairlyConfident') } } as const

const dayMonth = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Berlin', day: 'numeric', month: 'long' }))

/** Shows the scan photo's expiry and lets the device that took it delete it. */
export function ScanPhotoNote({ scan, fresh = false, onDeleted }: { scan: Pick<Scan, 'id' | 'photo'>; fresh?: boolean; onDeleted?: () => void }) {
  const t = useTranslation()
  const photo = livePhoto(scan)
  const [state, setState] = useState<'idle' | 'deleting' | 'deleted' | 'failed'>('idle')
  if (state === 'deleted') {
    return (
      <p className="photo-note" role="status">
        <Icon name="check" size={14} strokeWidth={2} />{' '}{t('photoDeleted')}</p>
    )
  }
  if (!photo) {
    return fresh ? (
      <p className="photo-note">
        <Icon name="image" size={14} />{' '}{t('theResultWasSavedWithoutThe')}</p>
    ) : null
  }
  return (
    <p className="photo-note">
      <Icon name="shieldCheck" size={14} />
      <span>{t('photoStoredPrivatelyUntil')}{' '}{dayMonth().format(new Date(photo.expiresAt))}.</span>
      <button
        type="button"
        className="photo-note__delete"
        disabled={state === 'deleting'}
        onClick={async () => {
          setState('deleting')
          try {
            await removeScanPhoto(scan.id, photo.url)
            setState('deleted')
            onDeleted?.()
          } catch {
            setState('failed')
          }
        }}
      >
        {state === 'deleting' ? t('deleting') : state === 'failed' ? t('retryDeletion') : t('deletePhoto')}
      </button>
    </p>
  )
}

function PlateResult({ scan, onAgain }: { scan: PlateScan; onAgain: () => void }) {
  const t = useTranslation()
  const { plate } = scan
  const n = plate.nutrients
  const [logged, setLogged] = useState(false)
  const [photo, setPhoto] = useState(() => livePhoto(scan))
  return (
    <section className="estimate" aria-labelledby="estimate-title">
      <div className="estimate__head">
        <AiBadge />
        <span className="estimate__conf">{t('cameraScreenConfidence')}{' '}{CONFIDENCE[plate.confidence]}</span>
      </div>
      <h2 className="estimate__title" id="estimate-title">
        {plate.name}
      </h2>
      <div className="estimate__kcal">
        <span className="estimate__big">{formatInt(n.kcal.value)}</span>
        <span className="estimate__unit">kcal</span>
        <span className="estimate__range">{t('range')}{' '}{formatInt(n.kcal.low)}-{formatInt(n.kcal.high)} kcal
        </span>
      </div>
      <ul className="estimate__macros">
        {MACROS.map(({ key, label }) => (
          <li key={key} className={`estimate__macro estimate__macro--${key}`}>
            <span className="estimate__macro-label">{label}</span>
            <b>{n[key].value} g</b>
            <span className="estimate__macro-range">
              {n[key].low}-{n[key].high} g
            </span>
          </li>
        ))}
      </ul>
      {plate.items.length > 0 && (
        <ul className="estimate__items" aria-label={t('detected')}>
          {plate.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {plate.note && <p className="estimate__note">{plate.note}</p>}
      <ScanPhotoNote scan={scan} fresh onDeleted={() => setPhoto(null)} />
      <div className="estimate__actions">
        <button
          className={`btn ${logged ? 'btn--secondary' : 'btn--primary'}`}
          disabled={logged}
          onClick={() => {
            logEstimate('plate', { ...estimateOf(plate.name, t('yourPhoto'), null, n), photo: photo ? { ...photo, scanId: scan.id } : undefined })
            setLogged(true)
          }}
        >
          <Icon name={logged ? 'check' : 'plus'} size={16} />
          {logged ? t('loggedForToday') : t('addToToday')}
        </button>
        {logged ? (
          <Link to={paths.today()} className="btn btn--secondary">{t('viewToday')}</Link>
        ) : (
          <button className="btn btn--secondary" onClick={onAgain}>{t('newPhoto')}</button>
        )}
      </div>
    </section>
  )
}

function MenuResult({ scan, photo, onAgain }: { scan: MenuScan; photo: Blob; onAgain: () => void }) {
  const t = useTranslation()
  const { menu } = scan
  const place = menu.restaurantName ?? t('myMenu')
  return (
    <section className="estimate" aria-labelledby="menu-title">
      <div className="estimate__head">
        <AiBadge />
        <span className="estimate__conf">
          <Icon name="check" size={12} strokeWidth={2} />{' '}{t('savedUnderMyMenus')}</span>
      </div>
      <h2 className="estimate__title" id="menu-title">
        {place}
      </h2>
      <p className="estimate__sub">{menu.dishes.length === 1 ? t('count1DishDetected') : t('count1DishesDetected', menu.dishes.length)}{t('estimatedValuesPerServing')}</p>
      <MenuDishes dishes={menu.dishes} place={place} />
      <ScanPhotoNote scan={scan} fresh />
      <SharePanel photo={photo} defaultName={menu.restaurantName ?? ''} />
      <div className="estimate__actions">
        <Link to={`${paths.today()}#cards-title`} className="btn btn--secondary">{t('myMenus')}</Link>
        <button className="btn btn--secondary" onClick={onAgain}>{t('newPhoto')}</button>
      </div>
    </section>
  )
}

/** The dishes of one of my menus, each with a one-tap "eaten". Shared with the Today tab's "Meine Karten". */
export function MenuDishes({ dishes, place }: { dishes: MenuDish[]; place: string }) {
  const t = useTranslation()
  const [logged, setLogged] = useState<Set<number>>(new Set())
  return (
    <ul className="menu-dishes">
      {dishes.map((d, i) => (
        <li key={`${d.name}-${i}`} className="menu-dish">
          <div className="menu-dish__text">
            <p className="menu-dish__name">{d.name}</p>
            {dishDescription(d) && <p className="menu-dish__desc">{dishDescription(d)}</p>}
            <p className="menu-dish__macros">
              <b>
                {formatInt(d.nutrients.kcal.low)}-{formatInt(d.nutrients.kcal.high)} kcal
              </b>
              <span>{d.nutrients.protein.value}{' '}{t('cameraScreenGProtein')}</span>
              {d.priceEur !== null && <span>{formatPrice(d.priceEur)}</span>}
            </p>
          </div>
          <button
            className={`menu-dish__add ${logged.has(i) ? 'is-done' : ''}`}
            aria-label={logged.has(i) ? t('loggedDish', d.name) : t('log1ForToday', d.name)}
            onClick={() => {
              if (logged.has(i)) return
              logEstimate('menu', estimateOf(d.name, place, d.priceEur, d.nutrients))
              setLogged((prev) => new Set(prev).add(i))
            }}
          >
            <Icon name={logged.has(i) ? 'check' : 'plus'} size={18} strokeWidth={2} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function SharePanel({ photo, defaultName }: { photo: Blob; defaultName: string }) {
  const t = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [consent, setConsent] = useState(false)
  const [pin, setPin] = useState<LatLng | null>(null)
  const [state, setState] = useState<{ name: 'idle' } | { name: 'sending' } | { name: 'sent' } | { name: 'error'; text: () => string }>({ name: 'idle' })

  if (state.name === 'sent') {
    return (
      <p className="share-panel share-panel--sent" role="status">
        <Icon name="check" size={16} strokeWidth={2} />{' '}{t('thanksTheTeamWillReviewThe')}</p>
    )
  }
  if (!open) {
    return (
      <button className="share-panel__open" onClick={() => setOpen(true)}>
        <Icon name="users" size={16} />{t('shareWithTheCommunity')}<Icon name="chevronRight" size={14} />
      </button>
    )
  }
  const valid = name.trim().length >= 2 && consent && pin !== null
  return (
    <form
      className="share-panel"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid || !pin) return
        setState({ name: 'sending' })
        try {
          await shareMenu(photo, { name: name.trim(), ...pin })
          setState({ name: 'sent' })
        } catch (error) {
          setState({ name: 'error', text: () => submitErrorText(error) })
        }
      }}
    >
      <p className="share-panel__title">{t('shareWithTheCommunity')}</p>
      <p className="share-panel__body">{t('theTeamWillReceiveThePhoto')}</p>
      <label className="share-panel__field">
        <span>{t('restaurant')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('restaurantName')} maxLength={120} required />
      </label>
      <div className="share-panel__field">
        <span>{t('locationOnTheMap')}</span>
        <Suspense fallback={<div className="pin-map pin-map--loading" aria-busy="true" />}>
          <PinMap center={BERLIN_CENTER} onMove={setPin} />
        </Suspense>
        <span className="t-muted">{t('moveTheMapUntilThePin')}</span>
      </div>
      <label className="share-panel__consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t('iTookThisPhotoItContains')}</span>
      </label>
      {state.name === 'error' && (
        <p className="camera__error" role="alert">
          <Icon name="alert" size={16} /> {state.text()}
        </p>
      )}
      <button className="btn btn--primary" disabled={!valid || state.name === 'sending'}>
        {state.name === 'sending' ? t('sending') : t('share')}
      </button>
    </form>
  )
}

function ResultSkeleton() {
  return (
    <div className="estimate estimate--skeleton" aria-hidden="true">
      <span className="sk sk--pill" />
      <span className="sk sk--title" />
      <span className="sk sk--big" />
      <span className="sk sk--row" />
    </div>
  )
}
