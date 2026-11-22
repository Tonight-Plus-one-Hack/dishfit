// framer-motion variant of the Plus One motion system.
// Every value comes from motion.json; springs use framer-motion's own duration/bounce solver,
// so curves match the measured reference exactly.
import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionStyle,
  type MotionValue,
  type Transition,
} from "framer-motion";
import { expoOut } from "./curves";
import { delay as delays, distance, duration, easing, opacity, s, spring, viewport, type SpringToken } from "./tokens";

type SpringName = "appear" | "text" | "textQuick" | "nav" | "zoom" | "state";

/** framer-motion transition for a duration-based spring token. */
export const springTransition = (name: SpringName, delayMs = 0): Transition => {
  const token: SpringToken = spring[name];
  return { type: "spring", duration: token.duration, bounce: token.bounce, delay: s(delayMs) };
};

type Trigger = "mount" | "inView";

function useTriggered(ref: React.RefObject<Element>, trigger: Trigger, amount: number, once: boolean) {
  const inView = useInView(ref, { amount, once });
  return trigger === "mount" ? true : inView;
}

// ---------------------------------------------------------------------------------------------
// Per-character blur reveal (display headlines, section headings, labels)
// ---------------------------------------------------------------------------------------------

export type CharRevealProps = {
  text: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  trigger?: Trigger;
  /** ms before the first character starts */
  startDelay?: number;
  /** ms between characters (25 headline, 20 quick, 15 label, 50 wide) */
  stagger?: number;
  spring?: "text" | "textQuick";
  amount?: number;
};

export function CharReveal({
  text,
  as: Tag = "span",
  className,
  style,
  trigger = "inView",
  startDelay = 0,
  stagger = duration.charStagger,
  spring: springName = "text",
  amount = viewport.eagerAmount,
}: CharRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const shown = useTriggered(ref, trigger, amount, true);
  if (reduced) return <Tag className={className} style={style}>{text}</Tag>;
  let index = 0;
  const words = text.split(" ");
  const hidden = { opacity: opacity.hidden, filter: `blur(${distance.charBlur}px)`, y: distance.charY };
  const visible = { opacity: 1, filter: "blur(0px)", y: 0 };
  return (
    <Tag ref={ref} className={className} style={style} aria-label={text}>
      {words.map((word, w) => (
        <Fragment key={w}>
        <span aria-hidden style={{ whiteSpace: "nowrap" }}>
          {[...word].map((char) => {
            const i = index++;
            return (
              <motion.span
                key={i}
                style={{ display: "inline-block", willChange: "transform, filter, opacity" }}
                initial={hidden}
                animate={shown ? visible : hidden}
                transition={springTransition(springName, startDelay + i * stagger)}
              >
                {char}
              </motion.span>
            );
          })}
        </span>
        {w < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------------------------
// Fade and slide reveal (hero art, sections, cards, headings, eyebrow labels, CTA zoom)
// ---------------------------------------------------------------------------------------------

export type RevealProps = {
  children?: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  x?: number;
  y?: number;
  scale?: number;
  delay?: number;
  spring?: SpringName;
  trigger?: Trigger;
  amount?: number;
  /** false: animate back out whenever it leaves the viewport (eyebrow labels) */
  once?: boolean;
};

export function Reveal({
  children,
  as = "div",
  className,
  style,
  x = 0,
  y = distance.revealY,
  scale = 1,
  delay = 0,
  spring: springName = "appear",
  trigger = "inView",
  amount = viewport.revealAmount,
  once = true,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const shown = useTriggered(ref, trigger, amount, once);
  const Component = motion[as as "div"] as typeof motion.div;
  const hidden = reduced ? { opacity: 1 } : { opacity: 0, x, y, scale };
  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      className={className}
      style={style as MotionStyle}
      initial={hidden}
      animate={shown ? { opacity: 1, x: 0, y: 0, scale: 1 } : hidden}
      transition={springTransition(springName, delay)}
    >
      {children}
    </Component>
  );
}

/** Header drop-in: y -80 to 0 on a 2 s spring with bounce 0.2. */
export function NavDrop({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <Reveal as="header" className={className} style={style} y={distance.navY} spring="nav" trigger="mount" delay={delays.hero.nav}>
      {children}
    </Reveal>
  );
}

/** Closing call-to-action backdrop: scale 2.5 to 1 with fade, 3 s spring. */
export function ZoomIn({ children, className, style }: { children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <Reveal className={className} style={style} y={0} scale={distance.zoomFromScale} spring="zoom" amount={viewport.eagerAmount}>
      {children}
    </Reveal>
  );
}

// ---------------------------------------------------------------------------------------------
// Rolling button label
// ---------------------------------------------------------------------------------------------

export type RollButtonProps = {
  label: string;
  href?: string;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  stagger?: number;
};

export function RollButton({ label, href, onClick, className, style, stagger = duration.rollCharStagger }: RollButtonProps) {
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const roll = easing.roll.cubicBezier;
  const press = { duration: s(duration.press), ease: easing.press.cubicBezier };
  const chars = [...label];
  const row = (incoming: boolean) => {
    const on = incoming ? hover : !hover;
    return chars.map((c, i) => (
      <motion.span
        key={i}
        style={{ display: "inline-block", whiteSpace: c === " " ? "pre" : "normal" }}
        initial={incoming ? { opacity: 0, y: distance.rollCharY } : false}
        animate={{ opacity: on ? 1 : 0, y: on ? 0 : incoming ? distance.rollCharY : -distance.rollCharY }}
        transition={{ duration: s(duration.rollChar), delay: s(i * stagger), ease: roll }}
      >
        {c === " " ? " " : c}
      </motion.span>
    ));
  };
  const Tag = href ? motion.a : motion.button;
  const rowTransition = { duration: s(duration.rollRow), ease: roll };
  const off = `${distance.rollRowPercent}%`;
  return (
    <Tag
      href={href}
      onClick={onClick}
      className={className}
      style={{ ...(style as MotionStyle), position: "relative", display: "inline-flex", overflow: "hidden" }}
      aria-label={label}
      onHoverStart={() => !reduced && setHover(true)}
      onHoverEnd={() => setHover(false)}
      onFocus={() => !reduced && setHover(true)}
      onBlur={() => setHover(false)}
      whileHover={reduced ? undefined : { scale: distance.pressScale }}
      whileTap={{ scale: distance.pressScale }}
      transition={press}
    >
      <span aria-hidden style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", height: "1.2em", overflow: "hidden" }}>
        <motion.span style={{ display: "flex" }} animate={{ y: hover ? `-${off}` : "0%" }} transition={rowTransition}>
          {row(false)}
        </motion.span>
        <motion.span style={{ display: "flex", position: "absolute" }} initial={{ y: off }} animate={{ y: hover ? "0%" : off }} transition={rowTransition}>
          {row(true)}
        </motion.span>
      </span>
    </Tag>
  );
}

// ---------------------------------------------------------------------------------------------
// Magnetic hover (art overlay and closing card)
// ---------------------------------------------------------------------------------------------

const MagneticContext = createContext<{ x: MotionValue<number>; y: MotionValue<number> } | null>(null);

export type MagneticProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  distance?: number;
  hoverArea?: number;
};

export function Magnetic({ children, className, style, distance: dist = distance.magneticDistance, hoverArea = distance.magneticHoverArea }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const cfg = { stiffness: spring.magnetic.stiffness, damping: spring.magnetic.damping, mass: spring.magnetic.mass };
  const sx = useSpring(nx, cfg);
  const sy = useSpring(ny, cfg);
  const x = useTransform(sx, (v) => v * dist);
  const y = useTransform(sy, (v) => v * dist);
  useEffect(() => {
    if (reduced || !matchMedia("(pointer: fine)").matches) return;
    const move = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left - hoverArea && e.clientX <= r.right + hoverArea && e.clientY >= r.top - hoverArea && e.clientY <= r.bottom + hoverArea;
      nx.set(inside ? (e.clientX - (r.left + r.width / 2)) / (r.width / 2) : 0);
      ny.set(inside ? (e.clientY - (r.top + r.height / 2)) / (r.height / 2) : 0);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [reduced, hoverArea, nx, ny]);
  return (
    <MagneticContext.Provider value={{ x: sx, y: sy }}>
      <motion.div ref={ref} className={className} style={{ ...(style as MotionStyle), x, y }}>
        {children}
      </motion.div>
    </MagneticContext.Provider>
  );
}

/** A child layer that travels further than its Magnetic parent (parallax depth). */
export function MagneticLayer({ children, className, style, distance: dist = distance.magneticChildDistance }: { children?: ReactNode; className?: string; style?: CSSProperties; distance?: number }) {
  const ctx = useContext(MagneticContext);
  const zero = useMotionValue(0);
  const x = useTransform(ctx?.x ?? zero, (v) => v * dist);
  const y = useTransform(ctx?.y ?? zero, (v) => v * dist);
  return <motion.div className={className} style={{ ...(style as MotionStyle), x, y }}>{children}</motion.div>;
}

// ---------------------------------------------------------------------------------------------
// Scroll-linked effects
// ---------------------------------------------------------------------------------------------

/** Sticky stage that converts vertical scroll into horizontal travel (0.894 px per px scrolled). */
export function StickyTrack({ children, className, trackClassName, style }: { children: ReactNode; className?: string; trackClassName?: string; style?: CSSProperties }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setTravel(Math.max(0, (track.current?.scrollWidth ?? 0) - window.innerWidth));
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -travel]);
  const height = `calc(100vh + ${Math.round(travel / motionScrollRatio())}px)`;
  return (
    <section ref={section} className={className} style={{ ...style, position: "relative", height }}>
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <motion.div ref={track} className={trackClassName} style={{ x, display: "flex", width: "max-content" }}>
          {children}
        </motion.div>
      </div>
    </section>
  );
}

const motionScrollRatio = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0.894);

/** Rotates its child 0.5 deg per px of page scroll, smoothed by a stiff spring (logo symbol). */
export function ScrollRotate({ children, className, degPerPx = distance.scrollRotateDegPerPx }: { children: ReactNode; className?: string; degPerPx?: number }) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const target = useTransform(scrollY, (v) => (reduced ? 0 : v * degPerPx));
  const rotate = useSpring(target, { stiffness: spring.scrollRotate.stiffness, damping: spring.scrollRotate.damping, mass: 1 });
  return <motion.div className={className} style={{ rotate, display: "inline-flex" }}>{children}</motion.div>;
}

/** Lenis smooth scrolling with the reference settings (duration 1 s, expo-out). */
export function useSmoothScroll(enabled = true) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!enabled || reduced) return;
    const lenis = new Lenis({ duration: s(duration.smoothScroll), easing: expoOut });
    let id = requestAnimationFrame(function raf(t) {
      lenis.raf(t);
      id = requestAnimationFrame(raf);
    });
    return () => { cancelAnimationFrame(id); lenis.destroy(); };
  }, [enabled, reduced]);
}

/** Footer that sits fixed behind the page and is uncovered as the last section scrolls away. */
export function CurtainFooter({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => setH(ref.current?.offsetHeight ?? 0));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden style={{ height: h }} />
      <footer ref={ref} className={className} style={{ ...style, position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        {children}
      </footer>
    </>
  );
}
