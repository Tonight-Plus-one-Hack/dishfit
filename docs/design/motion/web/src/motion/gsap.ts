// GSAP variant of the Plus One motion system (gsap + ScrollTrigger + Lenis).
// Springs are replayed with their closed-form curve, so timing matches the framer-motion variant.
// Use the functions directly, or mark up elements with data-motion attributes and call initMotion().
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { bezierEase, expoOut, springEase } from "./curves";
import { distance, duration, easing, opacity, s, spring, viewport } from "./tokens";

gsap.registerPlugin(ScrollTrigger);

type SpringName = "appear" | "text" | "textQuick" | "nav" | "zoom" | "state";
type Trigger = "mount" | "inView";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const roll = bezierEase(easing.roll.cubicBezier);
const press = bezierEase(easing.press.cubicBezier);
const start = (amount: number) => `${amount * 100}% bottom`;
const end = (amount: number) => `${(1 - amount) * 100}% top`;

/** Physical spring follower (for pointer- and scroll-driven values). */
class Follower {
  value = 0;
  target = 0;
  private velocity = 0;
  constructor(private stiffness: number, private damping: number, private onChange: (v: number) => void) {
    gsap.ticker.add(this.tick);
  }
  private tick = (_t: number, deltaMs: number) => {
    let dt = Math.min(deltaMs, 64) / 1000;
    if (Math.abs(this.target - this.value) < 1e-4 && Math.abs(this.velocity) < 1e-4) return;
    while (dt > 0) {
      const h = Math.min(dt, 0.004);
      this.velocity += (-this.stiffness * (this.value - this.target) - this.damping * this.velocity) * h;
      this.value += this.velocity * h;
      dt -= h;
    }
    this.onChange(this.value);
  };
  kill() { gsap.ticker.remove(this.tick); }
}

/** Splits text into per-character inline-block spans, keeping words unbreakable and the label accessible. */
export function splitChars(el: HTMLElement) {
  const text = el.textContent ?? "";
  el.setAttribute("aria-label", text);
  el.textContent = "";
  const chars: HTMLElement[] = [];
  const words = text.split(" ");
  words.forEach((word, w) => {
    const ws = document.createElement("span");
    ws.setAttribute("aria-hidden", "true");
    ws.style.whiteSpace = "nowrap";
    for (const c of word) {
      const cs = document.createElement("span");
      cs.textContent = c;
      cs.style.display = "inline-block";
      ws.append(cs);
      chars.push(cs);
    }
    el.append(ws);
    if (w < words.length - 1) el.append(" ");
  });
  return chars;
}

export type CharRevealOptions = { trigger?: Trigger; startDelay?: number; stagger?: number; spring?: "text" | "textQuick"; amount?: number };

export function charReveal(el: HTMLElement, { trigger = "inView", startDelay = 0, stagger = duration.charStagger, spring: name = "text", amount = viewport.eagerAmount }: CharRevealOptions = {}) {
  if (reduced()) return;
  const token = spring[name];
  const chars = splitChars(el);
  return gsap.fromTo(
    chars,
    { opacity: opacity.hidden, filter: `blur(${distance.charBlur}px)`, y: distance.charY },
    {
      opacity: 1, filter: "blur(0px)", y: 0,
      duration: token.duration, ease: springEase(token),
      stagger: s(stagger), delay: s(startDelay),
      scrollTrigger: trigger === "inView" ? { trigger: el, start: start(amount), once: true } : undefined,
    },
  );
}

export type RevealOptions = { x?: number; y?: number; scale?: number; delay?: number; spring?: SpringName; trigger?: Trigger; amount?: number; once?: boolean };

export function reveal(el: HTMLElement, { x = 0, y = distance.revealY, scale = 1, delay = 0, spring: name = "appear", trigger = "inView", amount = viewport.revealAmount, once = true }: RevealOptions = {}) {
  if (reduced()) return;
  const token = spring[name];
  const tween = gsap.fromTo(el, { opacity: 0, x, y, scale }, { opacity: 1, x: 0, y: 0, scale: 1, duration: token.duration, ease: springEase(token), delay: s(delay), paused: trigger === "inView" });
  if (trigger === "inView") {
    ScrollTrigger.create({
      trigger: el, start: start(amount), end: end(amount), once,
      // restart(true) honours the delay on first entry; play() resumes a partly reversed exit.
      onEnter: () => (tween.progress() === 0 ? tween.restart(true) : tween.play()),
      onEnterBack: () => (tween.progress() === 0 ? tween.restart(true) : tween.play()),
      onLeave: () => { if (!once) tween.reverse(); },
      onLeaveBack: () => { if (!once) tween.reverse(); },
    });
  }
  return tween;
}

export const navDrop = (el: HTMLElement) => reveal(el, { y: distance.navY, spring: "nav", trigger: "mount" });
export const zoomIn = (el: HTMLElement) => reveal(el, { y: 0, scale: distance.zoomFromScale, spring: "zoom", amount: viewport.eagerAmount });

export function rollButton(el: HTMLElement, { stagger = duration.rollCharStagger } = {}) {
  const label = el.textContent ?? "";
  el.setAttribute("aria-label", label);
  el.textContent = "";
  Object.assign(el.style, { position: "relative", display: "inline-flex", overflow: "hidden" });
  const box = document.createElement("span");
  box.setAttribute("aria-hidden", "true");
  Object.assign(box.style, { position: "relative", display: "flex", flexDirection: "column", alignItems: "center", height: "1.2em", overflow: "hidden" });
  const makeRow = (absolute: boolean) => {
    const row = document.createElement("span");
    Object.assign(row.style, { display: "flex", position: absolute ? "absolute" : "relative" });
    const chars = [...label].map((c) => {
      const cs = document.createElement("span");
      cs.textContent = c === " " ? " " : c;
      cs.style.display = "inline-block";
      row.append(cs);
      return cs;
    });
    box.append(row);
    return { row, chars };
  };
  const a = makeRow(false);
  const b = makeRow(true);
  el.append(box);
  const off = distance.rollRowPercent;
  gsap.set(b.row, { yPercent: off });
  gsap.set(b.chars, { opacity: 0, y: distance.rollCharY });
  const go = (on: boolean) => {
    if (reduced()) return;
    const rowVars = { duration: s(duration.rollRow), ease: roll, overwrite: true };
    gsap.to(a.row, { ...rowVars, yPercent: on ? -off : 0 });
    gsap.to(b.row, { ...rowVars, yPercent: on ? 0 : off });
    a.chars.forEach((c, i) => gsap.to(c, { opacity: on ? 0 : 1, y: on ? -distance.rollCharY : 0, duration: s(duration.rollChar), delay: s(i * stagger), ease: roll, overwrite: true }));
    b.chars.forEach((c, i) => gsap.to(c, { opacity: on ? 1 : 0, y: on ? 0 : distance.rollCharY, duration: s(duration.rollChar), delay: s(i * stagger), ease: roll, overwrite: true }));
    gsap.to(el, { scale: on ? distance.pressScale : 1, duration: s(duration.press), ease: press, overwrite: "auto" });
  };
  const on = () => go(true);
  const off2 = () => go(false);
  el.addEventListener("mouseenter", on);
  el.addEventListener("mouseleave", off2);
  el.addEventListener("focus", on);
  el.addEventListener("blur", off2);
  return () => { el.removeEventListener("mouseenter", on); el.removeEventListener("mouseleave", off2); el.removeEventListener("focus", on); el.removeEventListener("blur", off2); };
}

export function magnetic(el: HTMLElement, { distance: dist = distance.magneticDistance, childDistance = distance.magneticChildDistance, hoverArea = distance.magneticHoverArea, layers = "[data-magnetic-layer]" } = {}) {
  if (reduced() || !window.matchMedia("(pointer: fine)").matches) return () => {};
  const layerEls = [...el.querySelectorAll<HTMLElement>(layers)];
  const { stiffness, damping } = spring.magnetic;
  const apply = () => {
    gsap.set(el, { x: fx.value * dist, y: fy.value * dist });
    layerEls.forEach((l) => gsap.set(l, { x: fx.value * childDistance, y: fy.value * childDistance }));
  };
  const fx = new Follower(stiffness, damping, apply);
  const fy = new Follower(stiffness, damping, apply);
  const move = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    const inside = e.clientX >= r.left - hoverArea && e.clientX <= r.right + hoverArea && e.clientY >= r.top - hoverArea && e.clientY <= r.bottom + hoverArea;
    fx.target = inside ? (e.clientX - (r.left + r.width / 2)) / (r.width / 2) : 0;
    fy.target = inside ? (e.clientY - (r.top + r.height / 2)) / (r.height / 2) : 0;
  };
  window.addEventListener("mousemove", move);
  return () => { window.removeEventListener("mousemove", move); fx.kill(); fy.kill(); };
}

export function scrollRotate(el: HTMLElement, degPerPx = distance.scrollRotateDegPerPx) {
  if (reduced()) return () => {};
  const f = new Follower(spring.scrollRotate.stiffness, spring.scrollRotate.damping, (v) => gsap.set(el, { rotate: v }));
  const onScroll = () => { f.target = window.scrollY * degPerPx; };
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => { window.removeEventListener("scroll", onScroll); f.kill(); };
}

/** section > [data-track-stage] (sticky, 100vh) > [data-track] (wide flex row). */
export function stickyTrack(section: HTMLElement, track: HTMLElement, pxPerScrollPx = 0.894) {
  const travel = () => Math.max(0, track.scrollWidth - window.innerWidth);
  const size = () => { section.style.height = `${window.innerHeight + travel() / (reduced() ? 1 : pxPerScrollPx)}px`; };
  size();
  ScrollTrigger.addEventListener("refreshInit", size);
  return gsap.to(track, { x: () => -travel(), ease: "none", scrollTrigger: { trigger: section, start: "top top", end: "bottom bottom", scrub: true, invalidateOnRefresh: true } });
}

export function smoothScroll() {
  if (reduced()) return null;
  const lenis = new Lenis({ duration: s(duration.smoothScroll), easing: expoOut });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (t: number) => lenis.raf(t * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => { gsap.ticker.remove(tick); lenis.destroy(); };
}

export function curtainFooter(footer: HTMLElement) {
  Object.assign(footer.style, { position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "0" });
  const spacer = document.createElement("div");
  spacer.setAttribute("aria-hidden", "true");
  footer.before(spacer);
  const ro = new ResizeObserver(() => { spacer.style.height = `${footer.offsetHeight}px`; ScrollTrigger.refresh(); });
  ro.observe(footer);
  return () => { ro.disconnect(); spacer.remove(); };
}

const num = (v: string | undefined, d?: number) => (v === undefined || v === "" ? d : Number(v));

/** Wires every [data-motion] element under root. Returns a cleanup function. */
export function initMotion(root: ParentNode = document) {
  const cleanups: Array<() => void> = [];
  const ctx = gsap.context(() => {
    const stop = smoothScroll();
    if (stop) cleanups.push(stop);
    root.querySelectorAll<HTMLElement>("[data-motion]").forEach((el) => {
      const d = el.dataset;
      const trigger = (d.trigger as Trigger) ?? undefined;
      switch (d.motion) {
        case "chars":
          charReveal(el, { trigger, startDelay: num(d.delay), stagger: num(d.stagger), spring: d.spring as "text" | "textQuick" | undefined, amount: num(d.amount) });
          break;
        case "reveal":
          reveal(el, { x: num(d.x), y: num(d.y), scale: num(d.scale), delay: num(d.delay), spring: d.spring as SpringName | undefined, trigger, amount: num(d.amount), once: d.once !== "false" });
          break;
        case "nav": navDrop(el); break;
        case "zoom": zoomIn(el); break;
        case "roll": cleanups.push(rollButton(el)); break;
        case "magnetic": cleanups.push(magnetic(el)); break;
        case "rotate": cleanups.push(scrollRotate(el)); break;
        case "track": { const t = el.querySelector<HTMLElement>("[data-track]"); if (t) stickyTrack(el, t); break; }
        case "curtain": cleanups.push(curtainFooter(el)); break;
      }
    });
  });
  ScrollTrigger.refresh();
  return () => { cleanups.forEach((c) => c()); ctx.revert(); };
}
