// "Speisekarte scannen": a guest photographs a printed menu, picks the restaurant (or adds a new one) and sends it.
// One question per screen like onboarding. The photo is re-encoded in the browser (no EXIF/GPS); the Worker's review
// agent reads the dishes and answers on the status screen (/scan/:id). Only a published menu's photo is public.
import { useTranslation, translate } from '../../i18n'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { FlowBar, FlowFooter, Option, Question } from '../../components/Flow'
import { Icon } from '../../components/Icon'
import {
  createSubmission,
  listRestaurants,
  submissionConfig,
  type LatLng,
  type NewRestaurantInput,
  type RestaurantSummary,
  type SubmissionConfig,
} from '../../data/api'
import { useSearchParams } from '../../lib/location'
import { requestPosition, usePosition } from '../../lib/position'
import { BERLIN_CENTER } from '../../lib/geo'
import { back, navigate, paths } from '../../lib/routes'
import { recordContribution, restaurantKey } from './contributions'
import { submitErrorText, UPLOADS_PAUSED } from './messages'
import { PhotoError, photoFileName, preparePhoto, type PreparedPhoto } from '../../lib/photo'
import { Turnstile } from './Turnstile'
import './snap.css'

const PinMap = lazy(() => import('./PinMap'))

type Step = 'photo' | 'place' | 'send'
const STEPS: Step[] = ['photo', 'place', 'send']

type Place = { kind: 'existing'; id: string; name: string; meta?: string } | ({ kind: 'new' } & NewRestaurantInput)

const DEFAULT_CONFIG: SubmissionConfig = {
  uploadsEnabled: true,
  uploadsPaused: null,
  turnstileSiteKey: null,
  maxBytes: 5 * 1024 * 1024,
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')

function useConfig(): SubmissionConfig {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  useEffect(() => {
    let live = true
    submissionConfig()
      .then((c) => live && setConfig({ ...DEFAULT_CONFIG, ...c }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return config
}

// ---------- Step 1: photo ----------

function PhotoStep({
  photo,
  preparing,
  error,
  paused,
  onFile,
  onClear,
}: {
  photo: PreparedPhoto | null
  paused: SubmissionConfig['uploadsPaused']
  preparing: boolean
  error: string | null
  onFile: (file: File) => void
  onClear: () => void
}) {
  const t = useTranslation()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onFile(file)
  }
  return (
    <Question
      title={t('snapScreenTakeAPhotoOfTheMenu')}
      hint={t('onePagePerPhotoKeepIt')}
    >
      <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={pick} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      {photo ? (
        <figure className="snap-photo">
          <img src={photo.url} alt={t('yourMenuPhoto')} />
          <figcaption className="snap-photo__note">
            <Icon name="shieldCheck" size={14} />{t('locationDataIsRemovedBeforeUpload')}</figcaption>
          <button type="button" className="btn btn--ghost snap-photo__again" onClick={onClear}>{t('chooseAnotherPhoto')}</button>
        </figure>
      ) : paused ? (
        <div className="snap-pick">
          <div className="snap-drop snap-drop--paused" role="status">
            <span className="snap-drop__icon">
              <Icon name="camera" size={28} />
            </span>
            <span className="snap-drop__label">{UPLOADS_PAUSED[paused].title}</span>
            <span className="snap-drop__hint">{UPLOADS_PAUSED[paused].body}</span>
          </div>
        </div>
      ) : (
        <div className="snap-pick">
          <button type="button" className="snap-drop" onClick={() => camera.current?.click()} disabled={preparing} aria-busy={preparing}>
            <span className="snap-drop__icon">
              <Icon name="camera" size={28} />
            </span>
            <span className="snap-drop__label">{preparing ? t('preparingPhoto') : t('takePhoto')}</span>
            <span className="snap-drop__hint">{t('jpegPngOrWebp')}</span>
          </button>
          <button type="button" className="btn btn--secondary btn--wide" onClick={() => gallery.current?.click()} disabled={preparing}>
            <Icon name="image" size={16} />{t('chooseFromGallery')}</button>
          <p className="snap-privacy t-muted">
            <Icon name="shieldCheck" size={14} />{t('snapScreenLocationDataIsRemovedBeforeUpload')}</p>
        </div>
      )}
      {error && (
        <p className="snap-error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </Question>
  )
}

// ---------- Step 2: restaurant ----------

function useRestaurants(): RestaurantSummary[] | null {
  const [list, setList] = useState<RestaurantSummary[] | null>(null)
  useEffect(() => {
    let live = true
    listRestaurants({})
      .then((rs) => live && setList(rs))
      .catch(() => live && setList([]))
    return () => {
      live = false
    }
  }, [])
  return list
}

function SearchPlace({ place, onPick, onNew }: { place: Place | null; onPick: (p: Place) => void; onNew: () => void }) {
  const t = useTranslation()
  const restaurants = useRestaurants()
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    if (!restaurants) return []
    const q = norm(query.trim())
    const list = q ? restaurants.filter((r) => norm(`${r.name} ${r.address} ${r.kiez}`).includes(q)) : restaurants
    return list.slice(0, 6)
  }, [restaurants, query])
  return (
    <>
      <label className="snap-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          name="restaurant-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('findARestaurant')}
          aria-label={t('findARestaurant')}
          autoComplete="off"
        />
      </label>
      <div className="options snap-options" role="radiogroup" aria-labelledby="q-title">
        {restaurants === null && <span className="skeleton snap-sk" />}
        {matches.map((r) => (
          <Option
            key={r.id}
            icon="pin"
            label={r.name}
            hint={`${r.kiez} · ${r.address}`}
            checked={place?.kind === 'existing' && place.id === r.id}
            onSelect={() => onPick({ kind: 'existing', id: r.id, name: r.name, meta: `${r.kiez} · ${r.address}` })}
          />
        ))}
        {restaurants !== null && matches.length === 0 && <p className="t-muted snap-empty">{t('weDontHaveARestaurantBy')}</p>}
        <Option icon="plus" label={t('addANewRestaurant')} hint={t('nameAddressAndPinOnThe')} checked={false} onSelect={onNew} />
      </div>
    </>
  )
}

function NewPlace({ value, onChange }: { value: NewRestaurantInput; onChange: (v: NewRestaurantInput) => void }) {
  const t = useTranslation()
  const { position, status } = usePosition()
  const [center, setCenter] = useState<LatLng>(() => value.lat ? { lat: value.lat, lng: value.lng } : BERLIN_CENTER)
  const asked = useRef(false)
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])

  // After "Meinen Standort verwenden", jump the map to the device position once it arrives.
  useEffect(() => {
    if (asked.current && status === 'granted') {
      asked.current = false
      setCenter(position)
      onChange({ ...latest.current, lat: 0, lng: 0 })
    } else if (status !== 'locating') asked.current = false
  }, [status, position, onChange])

  return (
    <div className="snap-new">
      <label className="snap-field">
        <span className="t-label">{t('name')}</span>
        <input
          name="restaurant-name"
          value={value.name}
          maxLength={80}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder={t('eGCafeLindner')}
          autoComplete="off"
        />
      </label>
      <label className="snap-field">
        <span className="t-label">{t('address')}</span>
        <input
          name="restaurant-address"
          value={value.address}
          maxLength={120}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder={t('streetHouseNumberPostcode')}
          autoComplete="off"
        />
      </label>
      <div className="snap-field">
        <span className="t-label">{t('locationOnTheMap')}</span>
        <Suspense fallback={<div className="pin-map pin-map--loading" aria-busy="true" />}>
          <PinMap center={center} onMove={(p) => onChange({ ...latest.current, ...p })} />
        </Suspense>
        <div className="snap-map-row">
          <span className="t-muted">{t('moveTheMapUntilThePin')}</span>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              asked.current = true
              requestPosition()
            }}
            disabled={status === 'locating'}
          >
            <Icon name="locate" size={16} />
            {status === 'locating' ? t('searching') : t('snapScreenMyLocation')}
          </button>
        </div>
        {status === 'denied' && <p className="t-muted snap-small">{t('locationAccessWasntGrantedYouCan')}</p>}
      </div>
      <p className="snap-note">
        <Icon name="info" size={14} />{t('newRestaurantsAppearOnTheMap')}</p>
    </div>
  )
}

const validNew = (p: NewRestaurantInput) => p.name.trim().length >= 2 && p.address.trim().length >= 4 && p.lat !== 0

// ---------- Step 3: send ----------

function SendStep({
  photo,
  place,
  consent,
  onConsent,
  siteKey,
  onToken,
  error,
}: {
  photo: PreparedPhoto
  place: Place
  consent: boolean
  onConsent: (v: boolean) => void
  siteKey: string | null
  onToken: (t: string | null) => void
  error: string | null
}) {
  const t = useTranslation()
  return (
    <Question title={t('isEverythingReady')} hint={t('ourReviewAgentReadsTheMenu')}>
      <div className="snap-summary">
        <img src={photo.url} alt="" className="snap-summary__thumb" />
        <span className="snap-summary__text">
          <span className="snap-summary__title">{place.name}</span>
          <span className="t-muted">{place.kind === 'new' ? t('new1', place.address) : (place.meta ?? t('restaurantAlreadyListed'))}</span>
        </span>
      </div>
      <label className="snap-consent">
        <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} />
        <span>{t('iTookThisPhotoItShows')}</span>
      </label>
      {siteKey && <Turnstile siteKey={siteKey} onToken={onToken} />}
      {error && (
        <p className="snap-error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </Question>
  )
}

// ---------- Flow ----------

export function SnapScreen() {
  const t = useTranslation()
  const params = useSearchParams()
  const prefill = params.get('r')
  const prefillName = params.get('n')
  const config = useConfig()
  const [step, setStep] = useState<Step>('photo')
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [photoError, setPhotoError] = useState<{ text: () => string } | null>(null)
  const [place, setPlace] = useState<Place | null>(() =>
    prefill ? { kind: 'existing', id: prefill, name: prefillName || t('thisRestaurant') } : null,
  )
  const [placeMode, setPlaceMode] = useState<'search' | 'new'>('search')
  const [draft, setDraft] = useState<NewRestaurantInput>({ name: '', address: '', lat: 0, lng: 0 })
  const [consent, setConsent] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<{ text: () => string } | null>(null)

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url)
  }, [photo])

  const index = STEPS.indexOf(step)
  const close = () => back(prefill ? paths.restaurant(prefill) : paths.map())
  const prev = () => {
    if (step === 'place' && placeMode === 'new' && !prefill) {
      setPlaceMode('search')
      return
    }
    if (index > 0) setStep(STEPS[index - 1])
  }

  const onFile = async (file: File) => {
    setPhotoError(null)
    setPreparing(true)
    try {
      setPhoto(await preparePhoto(file, { tooSmall: 'thePhotoIsTooSmallTo' }))
    } catch (error) {
      setPhotoError({ text: () => (error instanceof PhotoError ? translate(error.key) : translate('somethingWentWrong')) })
    } finally {
      setPreparing(false)
    }
  }

  const chosen: Place | null = placeMode === 'new' ? (validNew(draft) ? { kind: 'new', ...draft } : null) : place
  const needsToken = config.turnstileSiteKey !== null
  const canSubmit = !!photo && !!chosen && consent && (!needsToken || !!token) && !sending

  const submit = async () => {
    if (!photo || !chosen) return
    setSending(true)
    setSendError(null)
    const form = new FormData()
    form.append('photo', new File([photo.blob], photoFileName(photo.blob, 'speisekarte'), { type: photo.blob.type }))
    form.append('consent', '1')
    if (chosen.kind === 'existing') {
      form.append('restaurantId', chosen.id)
      form.append('restaurantName', chosen.name)
    } else {
      form.append(
        'newRestaurant',
        JSON.stringify({ name: chosen.name.trim(), lat: chosen.lat, lng: chosen.lng, address: chosen.address.trim() }),
      )
    }
    if (token) form.append('turnstileToken', token)
    try {
      const submission = await createSubmission(form)
      recordContribution(submission.id, restaurantKey(submission.restaurant))
      navigate(paths.snapStatus(submission.id), { replace: true })
    } catch (error) {
      setSendError({ text: () => submitErrorText(error) })
      setSending(false)
    }
  }

  const next = () => {
    if (step === 'photo' && photo) setStep('place')
    else if (step === 'place' && chosen) {
      if (chosen.kind === 'new') setPlace(chosen)
      setStep('send')
    } else if (step === 'send') void submit()
  }

  const valid = step === 'photo' ? !!photo : step === 'place' ? !!chosen : canSubmit
  const showPrefilled = step === 'place' && placeMode === 'search' && prefill && place?.kind === 'existing' && place.id === prefill

  return (
    <div className="flow snap">
      <FlowBar
        progress={(index + 1) / (STEPS.length + 1)}
        label={t('step1Of2', index + 1, STEPS.length)}
        onBack={index > 0 || placeMode === 'new' ? prev : undefined}
        onClose={close}
      />
      <div className="flow__body" key={`${step}-${placeMode}`}>
        {step === 'photo' && (
          <PhotoStep
            photo={photo}
            preparing={preparing}
            error={photoError?.text() ?? null}
            paused={config.uploadsEnabled ? null : (config.uploadsPaused ?? 'unavailable')}
            onFile={(f) => void onFile(f)}
            onClear={() => {
              setPhoto(null)
              setPhotoError(null)
            }}
          />
        )}

        {step === 'place' && (
          <Question
            title={placeMode === 'new' ? t('profileScreenNewRestaurant') : t('whichRestaurantIsIt')}
            hint={placeMode === 'new' ? t('enterWhatYouCanVerifyOn') : undefined}
          >
            {placeMode === 'new' ? (
              <NewPlace value={draft} onChange={setDraft} />
            ) : showPrefilled ? (
              <div className="options snap-options snap-options--solo" role="radiogroup" aria-labelledby="q-title">
                <Option icon="pin" label={place.name} hint={t('fromTheRestaurantPage')} checked onSelect={() => undefined} />
                <button type="button" className="btn btn--ghost snap-other" onClick={() => setPlace(null)}>{t('chooseAnotherRestaurant')}</button>
              </div>
            ) : (
              <SearchPlace
                place={place}
                onPick={setPlace}
                onNew={() => setPlaceMode('new')}
              />
            )}
          </Question>
        )}

        {step === 'send' && photo && chosen && (
          <SendStep
            photo={photo}
            place={chosen}
            consent={consent}
            onConsent={setConsent}
            siteKey={config.turnstileSiteKey}
            onToken={setToken}
            error={sendError?.text() ?? null}
          />
        )}

        <FlowFooter>
          <button className="btn btn--primary btn--wide" disabled={!valid} onClick={next} aria-busy={sending}>
            {step === 'send' ? (sending ? t('sending') : t('sendPhoto')) : t('continue')}
            {step === 'send' && !sending && <Icon name="send" size={16} />}
          </button>
        </FlowFooter>
      </div>
    </div>
  )
}
