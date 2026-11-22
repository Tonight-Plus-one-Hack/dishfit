// /datenschutz: privacy policy per Art. 13 DSGVO. Describes what the app and the Worker actually do;
// update it whenever a data flow changes (new provider, new storage, new analytics event).
import { message, useTranslation } from '../../i18n'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { BRAND } from '../../lib/brand'
import { GOOGLE_MAPS_KEY, PLACES_ENABLED } from '../../lib/google-places'
import { Ext, LegalPage, OperatorAddress, OperatorEmail, Section } from './LegalPage'

export function DatenschutzScreen() {
  const t = useTranslation()
  return (
    <LegalPage title={t('privacyTitle')}>
      <p className="legal__lede">
        {BRAND.name} funktioniert ohne Konto. Dein Ziel, dein Tagebuch und gemerkte Gerichte bleiben auf deinem Gerät. Wir nutzen keine
        Werbe-Tracker und verkaufen keine Daten. Hier steht genau, welche Daten trotzdem anfallen, wer sie verarbeitet und welche Rechte
        du hast.
      </p>

      <Section title="1. Verantwortlich">
        <OperatorAddress />
        <p>
          E-Mail: <OperatorEmail />
        </p>
        <p>
          Mehr Angaben im <Link to={paths.impressum()}>Impressum</Link>.
        </p>
      </Section>

      <Section title="2. Hosting bei Cloudflare">
        <p>
          Website und Schnittstelle laufen bei Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA. Wir nutzen Cloudflare
          Workers (Auslieferung der App und der Schnittstelle), Cloudflare D1 (Datenbank mit Restaurants, Gerichten und den unten
          beschriebenen Einträgen) und Cloudflare Workers KV (Speicher für Fotos und Bilder).
        </p>
        <p>
          Bei jedem Aufruf verarbeitet Cloudflare technisch notwendige Daten: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser und
          Betriebssystem. Das ist nötig, um die Seite auszuliefern und vor Angriffen zu schützen. Fehler- und Ablaufprotokolle der
          Schnittstelle löscht Cloudflare nach wenigen Tagen automatisch.
        </p>
        <p>
          In unserer eigenen Datenbank speichern wir keine IP-Adressen. Um Missbrauch zu begrenzen (zum Beispiel zu viele Anfragen pro
          Minute), bilden wir aus der IP-Adresse einen Prüfwert (HMAC) mit einem zufälligen Schlüssel, der jeden Tag neu erzeugt und am
          Folgetag gelöscht wird. Danach lässt sich der Prüfwert keiner IP-Adresse mehr zuordnen.
        </p>
        <p>
          Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und stabilen Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare
          ist unser Auftragsverarbeiter (Art. 28 DSGVO). Dabei können Daten in die USA übermittelt werden. Cloudflare ist nach dem
          EU-US Data Privacy Framework zertifiziert (Angemessenheitsbeschluss, Art. 45 DSGVO); zusätzlich gelten
          Standardvertragsklauseln der EU-Kommission. Mehr in der{' '}
          <Ext href="https://www.cloudflare.com/privacypolicy/">Datenschutzerklärung von Cloudflare</Ext>.
        </p>
      </Section>

      {PLACES_ENABLED && GOOGLE_MAPS_KEY ? <Section title="3. Live-Inhalte von Google (Places UI Kit)">
        <p>
          Fotos, Bewertungen, Preisniveau und Öffnungszeiten von Restaurants zeigen wir nicht aus eigener Speicherung an, sondern laden sie
          direkt von Google in deinen Browser, sobald du ein Restaurant öffnest oder auf der Karte oder unter Entdecken eine Gerichtskarte
          eines Restaurants mit Google-Place-ID siehst. Dafür nutzen wir die Google Maps JavaScript API mit dem Places UI Kit. Anbieter ist Google Ireland Limited, Gordon
          House, Barrow Street, Dublin 4, Irland; Muttergesellschaft ist Google LLC, USA.
        </p>
        <p>
          Dabei erhält Google deine IP-Adresse, Angaben zu Browser und Gerät und welches Restaurant angezeigt wird. Google kann dabei
          Cookies oder ähnliche Techniken einsetzen. Wir speichern von Google nur die Kennung des Ortes (Place ID), keine Bewertungen und
          keine Fotos.
        </p>
        <p>
          Rechtsgrundlage ist unser berechtigtes Interesse, aktuelle Fotos und Öffnungszeiten anzuzeigen, ohne sie selbst zu speichern
          (Art. 6 Abs. 1 lit. f DSGVO). Google kann Daten in die USA übermitteln; Google LLC ist nach dem EU-US Data Privacy Framework
          zertifiziert (Art. 45 DSGVO), zusätzlich gelten Standardvertragsklauseln. Mehr in der{' '}
          <Ext href="https://policies.google.com/privacy">Datenschutzerklärung von Google</Ext> und den{' '}
          <Ext href="https://maps.google.com/help/terms_maps/">Nutzungsbedingungen von Google Maps</Ext>.
        </p>
      </Section> : (
        <Section title="3. Externer Routenlink (Google Maps)">
          <p>
            Wenn du auf einer Restaurantseite auf „Route“ klickst, öffnet sich Google Maps. Dort gilt die{' '}
            <Ext href="https://policies.google.com/privacy">Datenschutzerklärung von Google</Ext>.
          </p>
        </Section>
      )}

      <Section title="4. Karte (OpenFreeMap, OpenStreetMap)">
        <p>
          Die Kartenbilder lädt dein Browser von OpenFreeMap (<Ext href="https://openfreemap.org">openfreemap.org</Ext>), sobald du eine
          Karte öffnest. Dabei erhält der Kartenserver deine IP-Adresse, den sichtbaren Kartenausschnitt und Angaben zum Browser. Die
          Kartendaten stammen von OpenStreetMap. OpenFreeMap setzt nach eigenen Angaben keine Cookies und keine Tracker ein.
        </p>
        <p>Rechtsgrundlage ist unser berechtigtes Interesse an einer frei nutzbaren, werbefreien Karte (Art. 6 Abs. 1 lit. f DSGVO).</p>
      </Section>

      <Section title="5. Fotos und KI-Auswertung">
        <p>
          Du kannst ein Foto einer Speisekarte oder eines Tellers hochladen. Bevor das Foto dein Gerät verlässt, rechnet die App es neu und
          entfernt dabei Metadaten wie Standort, Aufnahmezeit und Kameradaten (EXIF). Der Server prüft das noch einmal und entfernt
          verbliebene Metadaten. Bitte fotografiere keine Personen.
        </p>
        <p>
          <strong>Speisekarte mit der Community teilen.</strong> Teilst du ein Foto, damit seine Gerichte in {BRAND.name} erscheinen,
          speichern wir es bei Cloudflare (Workers KV, Abschnitt 2). Bis zur Prüfung ist es nicht öffentlich abrufbar; nur
          dein Gerät und unser Team können es öffnen. Veröffentlichen wir die Speisekarte, ist auch das Foto (ohne Metadaten und ohne
          deinen Spitznamen) über die Adresse dieser Einsendung öffentlich abrufbar; ein abgelehntes Foto bleibt privat. Dazu
          speichern wir den Namen des Restaurants und seinen Kiez, bei einem neuen Restaurant den gesetzten Kartenpunkt und die Adresse,
          den Zeitpunkt, den täglich wechselnden IP-Prüfwert und dein Community-Profil (Abschnitt 6). Öffentlich erscheinen die
          ausgelesenen Gerichte mit Datum, ohne deinen Spitznamen; in der Bestenliste zählt der Upload für deinen Spitznamen. Das Foto löschen wir, sobald es für Prüfung und Nachvollziehbarkeit nicht
          mehr nötig ist, spätestens 12 Monate nach dem Hochladen. Rechtsgrundlage ist deine Einwilligung beim Hochladen (Art. 6 Abs. 1
          lit. a DSGVO), die du jederzeit per E-Mail widerrufen kannst.
        </p>
        <p>
          <strong>Eigene Scans.</strong> Bei einem Scan nur für dich (Teller oder Speisekarte) speichern wir das Ergebnis (erkannte
          Gerichte und geschätzte Nährwerte) und das Foto, verknüpft mit der zufälligen Geräte-ID, damit du beides unter „Meine Karten“
          und „Zuletzt gegessen“ wiederfindest. Das Foto liegt privat bei Cloudflare (Workers KV), nur dein Gerät kann es abrufen, und es
          löscht sich nach 30 Tagen automatisch. Du kannst das Foto jederzeit vorher löschen („Foto löschen“) oder den ganzen Scan
          („Karte löschen“). Rechtsgrundlage ist die Bereitstellung der Funktion, die du nutzt (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
        <p>
          <strong>KI-Anbieter.</strong> Um Gerichte zu erkennen und Nährwerte zu schätzen, senden wir das Foto an einen KI-Anbieter:
          Anthropic (Anthropic PBC, 548 Market St., San Francisco, CA 94104, USA) oder OpenAI (OpenAI Ireland Ltd., 1st Floor, The Liffey
          Trust Centre, 117-126 Sheriff Street Upper, Dublin 1, Irland, mit OpenAI, L.L.C., USA). Beide verarbeiten die Daten als unsere
          Auftragsverarbeiter, nur für diese Auswertung und nach ihren Bedingungen nicht zum Training ihrer Modelle. Dabei können Daten
          in die USA übermittelt werden; Grundlage sind Standardvertragsklauseln der EU-Kommission und, soweit der Anbieter zertifiziert
          ist, das EU-US Data Privacy Framework. Mehr bei <Ext href="https://www.anthropic.com/legal/privacy">Anthropic</Ext> und{' '}
          <Ext href="https://openai.com/policies/privacy-policy/">OpenAI</Ext>.
        </p>
        <p>
          <strong>Schutz vor automatisierten Uploads.</strong> Beim Hochladen kann Cloudflare Turnstile prüfen, ob ein Mensch die App
          bedient. Dafür verarbeitet Cloudflare Angaben zu Browser und Gerät sowie die IP-Adresse, ohne Cookies für Werbung. Rechtsgrundlage
          ist unser berechtigtes Interesse, Missbrauch zu verhindern (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
        <p>
          Ob ein geteiltes Foto veröffentlicht wird, entscheidet zunächst eine automatische Prüfung; Zweifelsfälle sieht sich unser Team an.
          Das hat keine rechtliche oder ähnlich erhebliche Wirkung für dich (Art. 22 DSGVO).
        </p>
      </Section>

      <Section title="6. Community-Profil, „Hat das gestimmt?“ und Bestenliste">
        <p>
          Teilst du eine Speisekarte, bestätigst oder korrigierst du ein Gericht („Hat das gestimmt?“) oder änderst du deinen Spitznamen,
          legt der Server ein anonymes Profil an. Es hängt an dem Cookie wohin_device (Abschnitt 9) und enthält eine zufällige ID, einen
          automatisch erzeugten Spitznamen, den du ändern kannst, den Zeitpunkt der Anlage und der letzten Nutzung sowie den täglich
          wechselnden IP-Prüfwert, nur um zu begrenzen, wie viele neue Profile aus einem Netz entstehen.
        </p>
        <p>
          Zu jeder Bestätigung speichern wir das Gericht und das Restaurant, ja oder nein, deine freiwillige Korrektur (höchstens 200
          Zeichen) und den Zeitpunkt. Dazu kommen die Abzeichen, die du verdient hast. Andere sehen nur zusammengezählte Bestätigungen pro
          Gericht. Die Bestenliste zeigt öffentlich deinen Spitznamen und wie viele Speisekarten und Gerichte du in einem Kiez beigetragen
          hast. Wähle deshalb bitte keinen echten Namen als Spitznamen.
        </p>
        <p>
          Rechtsgrundlage ist die Bereitstellung der Community-Funktionen, die du nutzt (Art. 6 Abs. 1 lit. b DSGVO). Wir speichern das
          Profil, solange du es nutzt. Löschst du das Cookie, ist das Profil von deinem Gerät aus nicht mehr erreichbar; auf Anfrage
          löschen wir es mit allen Bestätigungen und Abzeichen.
        </p>
      </Section>

      <Section title="7. E-Mail-Anmeldung und Premium-Warteliste">
        <p>
          Derzeit gibt es kein Konto. Bieten wir später eine freiwillige Anmeldung per E-Mail-Link an, um Daten
          zwischen Geräten abzugleichen, gilt: Wir speichern deine E-Mail-Adresse, den Zeitpunkt der Anmeldung und die Daten, die du
          abgleichen willst. Der Anmeldelink ist nur kurz gültig. Für den Versand nutzen wir einen E-Mail-Dienstleister als
          Auftragsverarbeiter, den wir dann hier nennen. Rechtsgrundlage ist die Bereitstellung des Kontos (Art. 6 Abs. 1 lit. b DSGVO).
          Löschst du das Konto, löschen wir diese Daten.
        </p>
        <p>
          Für die freiwillige Premium-Warteliste speichern wir deine E-Mail-Adresse, den Gutscheincode, das zugehörige Angebot
          und den Zeitpunkt deiner Einwilligung bei Cloudflare (Durable Objects). Wir verwenden diese Daten zur Verwaltung
          der Warteliste und zur Zuordnung deines Gutscheins. Der Code erscheint direkt in der App. Für die Anmeldung
          versenden wir keine E-Mail. Wir speichern die Daten, solange sie für die Warteliste und den Gutschein benötigt werden.
          Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit beim Verantwortlichen
          (Abschnitt 1) widerrufen kannst. Zur Begrenzung automatisierter Anfragen verarbeitet Cloudflare die IP-Adresse
          für ein kurzfristiges Anfragelimit. Die Warteliste speichert keine IP-Adressen.
        </p>
      </Section>

      <Section title="8. Nutzungsstatistik">
        <p>{message('de', 'privacyAnalyticsEvents')}</p>
        <p>
          Beim Teilen speichern wir eine zufällige Kennung des geteilten Links, das Gericht, den Weg (Teilen-Menü, WhatsApp,
          Link kopiert oder Story-Bild), die zufällige ID von deinem Gerät und den Zeitpunkt. Der geteilte Link trägt den Weg und diese
          Kennung. Öffnet jemand den Link, zählen wir das Öffnen mit Gericht, Weg und Zeitpunkt und vermerken, ob es nur eine
          Link-Vorschau (zum Beispiel von WhatsApp) war. So sehen wir, welche Gerichte geteilt und geöffnet werden.
        </p>
        <p>
          Wir speichern dabei keine IP-Adresse, keinen Namen und keine E-Mail-Adresse. Die Angaben bleiben in
          unserer Datenbank bei Cloudflare. Wir führen sie nicht mit anderen Datenquellen zusammen.
          Die Einzelangaben löschen wir spätestens nach 12 Monaten; danach bleiben nur Summen ohne Bezug zu einem Gerät.
        </p>
        <p>
          {message('de', 'privacyAnalyticsObjection')}{' '}<OperatorEmail />.
        </p>
        <p>
          <strong>Fathom Analytics.</strong> Wenn Fathom für die Website eingerichtet ist, messen wir damit Seitenaufrufe ohne
          Analyse-Cookies. Anbieter und Auftragsverarbeiter ist Conva Ventures Inc. (Kanada). Fathom erhält die besuchte Seite und, soweit
          verfügbar, die Herkunft des Aufrufs. Adressen mit Such- oder anderen URL-Parametern und Statusseiten einzelner Scans zählen wir
          dabei nicht. Die oben beschriebenen Angaben und die Geräte-ID senden wir nicht an Fathom.
        </p>
        <p>
          Fathom verarbeitet für die Statistik die IP-Adresse und Angaben zu deinem Browser (User-Agent). Daraus entsteht ein täglich
          wechselnder Prüfwert für diese Website. Fathom leitet Zugriffe aus der EU über EU-Server und anonymisiert dort die IP-Adresse,
          bevor die Statistik auf US-Infrastruktur weiterverarbeitet wird. Mehr zur{' '}
          <Ext href="https://usefathom.com/docs/script/eu-isolation">EU-Isolation</Ext> und in der{' '}
          <Ext href="https://usefathom.com/legal/privacy">Datenschutzerklärung von Fathom</Ext>.
        </p>
        <p>
          Rechtsgrundlage ist unser berechtigtes Interesse, die Nutzung der Seiten zu verstehen und die App zu verbessern (Art. 6 Abs. 1
          lit. f DSGVO). Für Fathom beachten wir „Do Not Track“. Du kannst der Verarbeitung widersprechen (Art. 21 DSGVO), indem du uns
          schreibst oder die <Ext href="https://usefathom.com/docs/script/exclude-visits#how-to-exclude-yourself-via-your-browser-console">Fathom-Zählung in deinem Browser ausschaltest</Ext>.
        </p>
      </Section>

      <Section title="9. Speicherung auf deinem Gerät">
        <p>
          Die App speichert im lokalen Speicher deines Browsers (localStorage): deine Sprachwahl, dein Ziel und deine Kalorien- und Proteinwerte, dein
          Tagebuch, gemerkte Gerichte, deinen Kiez, deine Auswahl zur Standortfreigabe, Meldungen zu Gerichten, „Meine Karten“, deine
          geteilten Speisekarten, ob der Hinweis zum Installieren schon gezeigt wurde, und Ansichtseinstellungen. Diese Daten verlassen
          dein Gerät nicht. Außerdem liegt dort die zufällige ID für Statistik und geteilte Links (Abschnitt 8). Ziel, Tagebuch, gemerkte
          Gerichte und die Ortsauswahl löschst du unter „Heute“ mit „Meine Daten löschen“, alles zusammen über die Website-Daten in deinem
          Browser.
        </p>
        <p>{t('locationPrivacyNotice')}</p>
        <p>
          Lädst du ein Foto hoch, scannst du etwas oder nutzt du dein Community-Profil, setzt der Server ein Cookie mit einer zufälligen,
          signierten Geräte-ID (wohin_device, gültig ein Jahr, nur für unsere Schnittstelle, für Skripte nicht lesbar). Es dient dazu,
          Missbrauch zu begrenzen und dir deine eigenen Scans, Beiträge und Bestätigungen zuzuordnen.
        </p>
        <p>
          Diese Speicherungen sind für die Funktionen nötig, die du ausdrücklich nutzt (§ 25 Abs. 2 Nr. 2 TDDDG). Die Verarbeitung stützen
          wir auf Art. 6 Abs. 1 lit. b und f DSGVO.
        </p>
      </Section>

      <Section title="10. Empfänger">
        <p>
          Daten erhalten nur die oben genannten Dienstleister, soweit es für ihre Aufgabe nötig ist. Wir verkaufen keine Daten und geben sie
          nicht für Werbung weiter. Eine Pflicht, uns Daten bereitzustellen, gibt es nicht; ohne die technisch nötigen Daten kann die
          Website aber nicht angezeigt werden.
        </p>
      </Section>

      <Section title="11. Deine Rechte">
        <p>Du hast das Recht auf</p>
        <ul className="legal__list">
          <li>Auskunft über deine Daten (Art. 15 DSGVO),</li>
          <li>Berichtigung (Art. 16 DSGVO),</li>
          <li>Löschung (Art. 17 DSGVO),</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO),</li>
          <li>Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO),</li>
          <li>Widerruf einer Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO).</li>
        </ul>
        <p>
          Schreib dazu an <OperatorEmail />. Weil wir dich nicht namentlich kennen, helfen uns dein Spitzname, der Zeitpunkt eines Uploads
          oder einer Bestätigung, deine Daten zu finden.
        </p>
        <p>
          Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO). Für uns zuständig ist die Berliner
          Beauftragte für Datenschutz und Informationsfreiheit, Alt-Moabit 59-61, 10555 Berlin,{' '}
          <Ext href="https://www.datenschutz-berlin.de">datenschutz-berlin.de</Ext>.
        </p>
      </Section>

      <Section title="12. Änderungen">
        <p>Ändert sich die App oder ein Dienstleister, passen wir diese Erklärung an. Es gilt die hier veröffentlichte Fassung.</p>
      </Section>
    </LegalPage>
  )
}
