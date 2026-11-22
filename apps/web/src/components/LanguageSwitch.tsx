import { setLanguage, useLanguage, useTranslation, type Language } from '../i18n'
import './language-switch.css'

const options: readonly Language[] = ['de', 'en']

export function LanguageSwitch() {
  const language = useLanguage()
  const t = useTranslation()
  return (
    <div className="language-switch" role="group" aria-label={t('language')}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`btn ${option === language ? 'btn--primary' : 'btn--secondary'} language-switch__option`}
          lang={option}
          aria-label={t(option === 'de' ? 'germanLanguage' : 'englishLanguage')}
          aria-pressed={option === language}
          onClick={() => setLanguage(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
