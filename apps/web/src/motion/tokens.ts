// Typed view of ./motion.json (copied from docs/design/motion/motion.json on fm/thayon-motion), the single source of truth for motion.
import raw from "./motion.json";

export type SpringToken = {
  use: string;
  stiffness: number;
  damping: number;
  mass: number;
  duration?: number;
  bounce?: number;
  durationMs?: number;
  cubicBezier?: [number, number, number, number];
  linear?: string;
};

export type Bezier = [number, number, number, number];

export const motionTokens = raw as unknown as {
  spring: Record<"appear" | "text" | "textQuick" | "nav" | "zoom" | "state" | "magnetic" | "scrollRotate", SpringToken>;
  easing: Record<"roll" | "press" | "smoothScroll", { use: string; cubicBezier: Bezier }>;
  duration: Record<string, number>;
  delay: { hero: Record<"nav" | "headline" | "lede" | "action" | "art" | "strip", number>; sequence: number[]; labelStart: number };
  distance: Record<string, number>;
  opacity: { hidden: number };
  viewport: { revealAmount: number; eagerAmount: number; once: boolean; labelOnce: boolean };
  scroll: { smoothDuration: number; stickyTrackPxPerScrollPx: number };
};

export const { spring, easing, duration, delay, distance, opacity, viewport } = motionTokens;

/** Seconds helper: tokens are stored in milliseconds. */
export const s = (ms: number) => ms / 1000;

/** CSS cubic-bezier() string for a bezier token. */
export const cssBezier = (b: Bezier) => `cubic-bezier(${b.join(", ")})`;
