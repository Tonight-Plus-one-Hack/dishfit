// Closed-form damped spring (mass-normalised), matching framer-motion's spring generator.
// Used to drive GSAP with the exact same curve the framer-motion variant produces.
import type { SpringToken } from "./tokens";

export function springProgress({ stiffness, damping, mass = 1 }: SpringToken, tSeconds: number) {
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const w0 = Math.sqrt(stiffness / mass);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * tSeconds) * (((zeta * w0) / wd) * Math.sin(wd * tSeconds) + Math.cos(wd * tSeconds));
  }
  return 1 - Math.exp(-w0 * tSeconds) * (1 + w0 * tSeconds);
}

/** An easing function over [0, 1] that replays a duration-based spring token exactly. */
export function springEase(token: SpringToken) {
  const seconds = token.duration ?? 1;
  return (p: number) => (p >= 1 ? 1 : springProgress(token, p * seconds));
}

/** An easing function for a CSS-style cubic-bezier(x1, y1, x2, y2). */
export function bezierEase([x1, y1, x2, y2]: readonly [number, number, number, number]) {
  const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      const d = dx(t);
      if (Math.abs(err) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

/** Lenis' default wheel easing (expo-out), used by both smooth-scroll variants. */
export const expoOut = (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t));
