// Impressum (§ 5 DDG) and Datenschutzerklärung (Art. 13 DSGVO), in German as German law expects.
// Everything about the operator comes from the captain: those spots are visible placeholders, nothing is invented.
// The data inventory describes what this app and the Worker contract actually store; keep it in sync.
import type { ReactNode } from 'react'
import { AppFrame } from '../components/Chrome'
import { BRAND } from '../lib/brand'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import './app.css'
import './legal.css'

function Todo({ children }: { children: ReactNode }) {
  return <mark className="todo">[{children}]</mark>
}

function LegalPage({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <AppFrame>
      <div className="band">
        <div className="rails page">
          <article className="legal">
            <header className="legal__head">
              <p className="t-label">{kicker}</p>
              <h1 className="t-section">{title}</h1>
              <p className="t-muted legal__lang">Legal information in German, as required in Germany.</p>
            </header>
            <div className="legal__body">{children}</div>
          </article>
        </div>
      </div>
    </AppFrame>
  )
}

export function Imprint() {
  return (
    <LegalPage kicker="Legal notice" title="Impressum">
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>
          <Todo>Captain: vollständiger Name oder Firma</Todo>
          <br />
          <Todo>Captain: ladungsfähige Anschrift</Todo>
        </p>
      </section>
      <section>
        <h2>Kontakt</h2>
        <p>
          <Todo>Captain: E-Mail-Adresse</Todo>
        </p>
      </section>
      <section>
        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p>
          <Todo>Captain: Name und Anschrift</Todo>
        </p>
      </section>
      <section>
        <h2>Über dieses Projekt</h2>
        <p>
          {BRAND.name} ist ein Prototyp, entstanden beim Layla 5K Build &amp; Launch Hackathon in Berlin (21. und 22.
          November 2026). Die gezeigten Gruppen und Spitznamen mit dem Hinweis „Demo“ sind Beispieldaten.
        </p>
      </section>
      <section>
        <h2>Karten und Ortsdaten</h2>
        <p>
          Orte: © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL). Kartenkacheln: OpenFreeMap,
          © OpenMapTiles.
        </p>
      </section>
      <p className="legal__also">
        Siehe auch die <Link to={paths.privacy()}>Datenschutzerklärung</Link>.
      </p>
    </LegalPage>
  )
}

export function Privacy() {
  return (
    <LegalPage kicker="Privacy" title="Datenschutzerklärung">
      <section>
        <h2>Verantwortlicher</h2>
        <p>
          <Todo>Captain: Name, Anschrift, E-Mail</Todo>
        </p>
      </section>
      <section>
        <h2>Was {BRAND.name} speichert</h2>
        <ul>
          <li>Eine zufällige Gerätekennung in einem Cookie, damit du ohne Konto beitreten und eine Gruppe starten kannst.</li>
          <li>
            Wenn du einer Gruppe beitrittst oder eine startest: deinen Spitznamen, optional einen kurzen Satz über dich und
            deine Bestätigung, dass du 18 Jahre oder älter bist.
          </li>
          <li>Nachrichten im Gruppenchat, deinen „Ich bin da“-Check-in sowie Meldungen und Blockierungen.</li>
          <li>
            Nutzungsereignisse ohne Namen (zum Beispiel: Stadt angesehen, Link geteilt, Partner-Link geklickt), verknüpft mit
            der Gerätekennung. Daraus entstehen nur Summen, etwa für die öffentliche Zahlen-Seite.
          </li>
          <li>Gemerkte Orte und dein zuletzt benutzter Spitzname bleiben nur in deinem Browser.</li>
        </ul>
        <p>
          Kein Standort-Tracking: Du wählst die Stadt selbst. Wir fragen weder Telefonnummer noch E-Mail-Adresse ab und es
          gibt kein Konto.
        </p>
      </section>
      <section>
        <h2>Wer was sieht</h2>
        <p>
          Wer einer Gruppe nicht beigetreten ist, sieht nur Initialen und die Anzahl der Teilnehmenden. Spitznamen, den Satz
          über dich und den Chat sehen nur Mitglieder derselben Gruppe. Gruppen enden um 06:00 Uhr Ortszeit und sind danach
          nicht mehr öffentlich sichtbar.
        </p>
      </section>
      <section>
        <h2>Dienste von Dritten</h2>
        <ul>
          <li>
            Hosting und Datenbank: <Todo>Captain: Anbieter und Speicherregion</Todo>
          </li>
          <li>
            Karten: Wenn du eine Karte öffnest, lädt dein Browser Kartenkacheln von OpenFreeMap (tiles.openfreemap.org). Dabei
            wird deine IP-Adresse an diesen Dienst übertragen.
          </li>
          <li>Schriften werden von unserem eigenen Server geladen, nicht von Google oder anderen Anbietern.</li>
          <li>
            Partner-Links (Expedia, Hotels.com, Vrbo, Layla) und WhatsApp öffnen die Seite des Anbieters erst nach deinem
            Klick; dort gilt dessen Datenschutzerklärung. Den Klick auf einen Partner-Link zählen wir, bevor wir weiterleiten.
          </li>
          <li>
            Geteilte Links enthalten die Angaben utm_source und utm_medium, damit wir zählen können, wie viele Menschen über
            geteilte Links kommen. <Todo>Captain: festlegen, ob diese Angabe in einem Cookie gespeichert wird</Todo>
          </li>
        </ul>
      </section>
      <section>
        <h2>Rechtsgrundlagen und Speicherdauer</h2>
        <p>
          <Todo>Captain: Rechtsgrundlagen nach Art. 6 DSGVO und Löschfristen für Gerätekennung, Chat, Meldungen und Ereignisse</Todo>
        </p>
      </section>
      <section>
        <h2>Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und
          Widerspruch sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Anfragen an:{' '}
          <Todo>Captain: Kontakt für Datenschutzanfragen</Todo>
        </p>
      </section>
      <p className="legal__also">
        Siehe auch das <Link to={paths.imprint()}>Impressum</Link>.
      </p>
    </LegalPage>
  )
}
