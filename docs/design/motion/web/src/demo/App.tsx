import { useEffect } from "react";
import hero from "@brand/assets/hero.webp";
import berlin from "@brand/assets/city-berlin.webp";
import hamburg from "@brand/assets/city-hamburg.webp";
import paris from "@brand/assets/city-paris.webp";
import registration from "@brand/assets/registration.svg";
import { useSmoothScroll } from "../motion/framer";
import { initMotion } from "../motion/gsap";
import { delay, distance } from "../motion/tokens";
import { Chars, Curtain, Magnetic, MagneticLayer, Nav, Reveal, Roll, Rotate, Track, VariantContext, Zoom, type Variant } from "./adapters";

// Geometry copied from brand/assets/symbol.svg; currentColor so it inverts on dark surfaces.
const Symbol = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <g fill="currentColor">
      <path d="M11.1 6.2 16 2.4c1.5-1.2 3.4-1.1 4.9 0l3.8 3c2.1 1.7 2.1 3.7.1 5.5-4 3.6-8.8 3.9-13.2.8-2.5-1.8-2.7-3.7-.5-5.5Z" />
      <path d="M5.1 12.6c1.4-1.8 3.1-2 4.7-.5 4 3.8 4.3 8.1.6 12.3-1.7 2-3.6 2.1-5.3.1l-2.2-2.9c-1.8-2.3-1.6-4.7.1-7l2.1-2Z" />
      <path d="M12 24.4c2.4-3 6.5-4.7 11.3-4.2 1 .1 1.4-.2 1.4-1.1 0-.7.6-.9 1.1-.5l2.2 2c2 1.9 1.9 4-.2 6l-4.6 3.1c-3.9 2.2-7.1 1.5-10.5-.8-1.8-1.2-2.1-2.7-.7-4.5Z" />
      <circle cx="28.4" cy="14" r="2.8" />
    </g>
  </svg>
);

const spots = [
  { img: berlin, city: "Berlin", title: "Canal-side bar crawl", meta: ["5 going", "20:30", "Kreuzberg"] },
  { img: hamburg, city: "Hamburg", title: "Harbour lights walk", meta: ["4 going", "21:00", "St. Pauli"] },
  { img: paris, city: "Paris", title: "Late jazz in the Marais", meta: ["6 going", "22:00", "Le Marais"] },
  { img: hero, city: "Berlin", title: "Rooftop sunset, then dinner", meta: ["3 going", "19:45", "Neukölln"] },
  { img: berlin, city: "Berlin", title: "Open-air cinema", meta: ["7 going", "21:30", "Friedrichshain"] },
];

export function App({ variant }: { variant: Variant }) {
  useSmoothScroll(variant === "framer");
  useEffect(() => (variant === "gsap" ? initMotion(document) : undefined), [variant]);
  const h = delay.hero;
  return (
    <VariantContext.Provider value={variant}>
      <div className="page">
        <Nav className="nav">
          <a className="brand" href="#top" aria-label="Plus One home">
            <Rotate className="brand-mark"><Symbol /></Rotate>
            <span className="brand-word">Plus One</span>
          </a>
          <nav className="nav-links">
            <a href="#how">How it works</a>
            <a href="#spots">Spots</a>
            <a href="#cities">Cities</a>
          </nav>
          <Roll className="btn btn-light" label="Join tonight" href="#join" />
        </Nav>

        <main id="top">
          <section className="hero">
            <Chars as="h1" className="hero-title" trigger="mount" text="Alone tonight? Join a small group heading out to the best spots in your city" />
            <Reveal className="hero-lede" trigger="mount" delay={h.lede}>
              <p>Pick a city, see who is free tonight, and meet three to seven people at a public spot.</p>
            </Reveal>
            <Reveal className="hero-action" trigger="mount" delay={h.action}>
              <Roll className="btn btn-dark" label="Find my group" href="#join" />
            </Reveal>
            <Reveal className="hero-art" trigger="mount" y={distance.heroArtY} delay={h.art}>
              <img src={hero} alt="Three friends meeting on a city corner at night, abstract and soft-focus" />
              <div className="hero-fade" />
              <Magnetic className="hero-overlay">
                <img src={registration} alt="" />
                <MagneticLayer className="hero-overlay-dot" />
              </Magnetic>
            </Reveal>
          </section>

          <Reveal className="strip" trigger="mount" y={distance.heroArtY} delay={h.strip}>
            {["Groups of 3 to 8", "Public spots only", "Tonight, not someday", "Berlin · Hamburg · Paris"].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </Reveal>

          <section className="dark" id="how">
            <div className="dark-grid">
              <div>
                <Reveal className="label" y={distance.labelY} delay={300} once={false}>How it works</Reveal>
                <Chars as="h2" className="section-title" spring="textQuick" stagger={15} startDelay={delay.labelStart} text="Going out alone should not mean staying in" />
              </div>
              <div className="steps">
                {[
                  ["Pick a city", "Choose where you are tonight. Plus One shows who else is free and nearby."],
                  ["Join a group", "Small groups of three to eight form around one plan and one time."],
                  ["Meet in public", "Every hangout starts at a public spot, so the first hello always feels easy."],
                ].map(([t, b], i) => (
                  <Reveal key={t} className="step" x={i % 2 ? distance.revealX : -distance.revealX} y={0} delay={i * 200}>
                    <h3>{t}</h3>
                    <p>{b}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section className="light">
            <Chars as="h3" className="feature-title" text="Two ways to go out tonight, both built around small groups" />
            <div className="cards">
              {[
                ["Join", "Browse groups forming near you and grab the open seat. You will know the plan, the spot and who is coming."],
                ["Host", "Post a plan for tonight, set the group size, and let Plus One fill the seats with people who want the same night."],
              ].map(([t, b], i) => (
                <Reveal key={t} className="card" delay={[300, 500][i]}>
                  <Symbol size={24} />
                  <h3>{t}</h3>
                  <p>{b}</p>
                </Reveal>
              ))}
            </div>
            <Reveal delay={900}>
              <Roll className="btn btn-dark" label="Find my group" href="#join" />
            </Reveal>
          </section>

          <div id="spots">
            <Track className="track-section" trackClassName="track">
              <div className="track-intro">
                <Reveal className="label label-light" y={distance.labelY} once={false}>Tonight's spots</Reveal>
                <Chars as="h2" className="section-title ink" spring="textQuick" stagger={20} text="Where groups are heading" />
              </div>
              {spots.map((sp, i) => (
                <article className="spot" key={i}>
                  <img src={sp.img} alt={`${sp.city} at night, atmospheric illustration`} />
                  <div className="spot-body">
                    <span className="mono">{sp.city}</span>
                    <h3>{sp.title}</h3>
                    <div className="spot-meta">{sp.meta.map((m) => <span key={m}>{m}</span>)}</div>
                  </div>
                </article>
              ))}
            </Track>
          </div>

          <section className="note" id="cities">
            <Reveal className="note-label" x={-distance.revealX} y={0}>Why we built it</Reveal>
            <Reveal className="note-body" x={distance.revealX} y={0} delay={200}>
              <p>Most nights out start with a group chat that never decides. Plus One starts with a time, a place and a few people who already said yes.</p>
            </Reveal>
          </section>

          <section className="cta" id="join">
            <Zoom className="cta-backdrop"><img src={hero} alt="" /></Zoom>
            <Magnetic className="cta-card">
              <Reveal y={distance.revealYSmall}><h2>Your group is one tap away</h2></Reveal>
              <Reveal delay={200}><Roll className="btn btn-dark" label="Find my group" href="#top" /></Reveal>
            </Magnetic>
          </section>
        </main>

        <Curtain className="footer">
          <div className="footer-inner">
            <span className="footer-brand"><Symbol size={22} /> Plus One</span>
            <p>Small groups. Public spots. Tonight.</p>
            <div className="footer-links"><a href="#how">How it works</a><a href="#spots">Spots</a><a href="#top">Back to top</a></div>
          </div>
          <div className="footer-mark" aria-hidden><Symbol size={420} /></div>
        </Curtain>
      </div>
    </VariantContext.Provider>
  );
}
