// /impressum: provider identification per § 5 DDG. The personal data comes from operator.json.
import { useTranslation } from '../../i18n'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { BRAND } from '../../lib/brand'
import { Ext, LegalPage, OperatorAddress, OperatorEmail, Section } from './LegalPage'

export function ImpressumScreen() {
  const t = useTranslation()
  return (
    <LegalPage title={t('legalNotice')}>
      <Section title="Angaben gemäß § 5 DDG">
        <OperatorAddress />
      </Section>

      <Section title="Kontakt">
        <p>
          E-Mail: <OperatorEmail />
        </p>
      </Section>

      <Section title="Verantwortlich für den Inhalt">
        <p>Die oben genannte Person.</p>
      </Section>

      <Section title="Hinweis zu Nährwerten">
        <p>
          {BRAND.name} zeigt Nährwerte überwiegend als Schätzungen, die eine KI aus den Speisekarten der Restaurants errechnet. Sie sind
          als Schätzung gekennzeichnet und als Spanne angegeben. Offizielle Angaben eines Restaurants sind als solche markiert.
        </p>
        <p>Die Angaben ersetzen keine ärztliche oder ernährungsfachliche Beratung. Bei Allergien und Unverträglichkeiten frag bitte im Restaurant nach.</p>
      </Section>

      <Section title="Kartendaten und Bilder">
        <p>
          Kartendaten © <Ext href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</Ext> (ODbL), Kartenstil von{' '}
          <Ext href="https://openfreemap.org">OpenFreeMap</Ext> und © OpenMapTiles. Bilder von Gerichten sind KI-Illustrationen und als
          „KI-Bild“ gekennzeichnet. Fotos, Bewertungen und Öffnungszeiten von Google stammen direkt von Google und sind entsprechend
          gekennzeichnet.
        </p>
      </Section>

      <Section title="Verbraucherstreitbeilegung">
        <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </Section>

      <Section title="Datenschutz">
        <p>
          Wie wir mit Daten umgehen, steht in der <Link to={paths.datenschutz()}>Datenschutzerklärung</Link>.
        </p>
      </Section>
    </LegalPage>
  )
}
