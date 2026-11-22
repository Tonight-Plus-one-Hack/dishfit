// Lets one demo tree render with either variant: framer-motion components, or plain
// elements carrying data-motion attributes that the GSAP initMotion() wires up.
import { createContext, useContext, type CSSProperties, type ElementType, type ReactNode } from "react";
import * as F from "../motion/framer";

export type Variant = "framer" | "gsap";
export const VariantContext = createContext<Variant>("framer");
const useVariant = () => useContext(VariantContext);

const data = (o: Record<string, string | number | boolean | undefined>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [`data-${k}`, String(v)]));

export function Chars(p: F.CharRevealProps) {
  if (useVariant() === "framer") return <F.CharReveal {...p} />;
  const { as: Tag = "span", text, className, style, trigger, startDelay, stagger, spring, amount } = p;
  return <Tag className={className} style={style} {...data({ motion: "chars", trigger, delay: startDelay, stagger, spring, amount })}>{text}</Tag>;
}

export function Reveal(p: F.RevealProps) {
  if (useVariant() === "framer") return <F.Reveal {...p} />;
  const { as: Tag = "div", className, style, children, x, y, scale, delay, spring, trigger, amount, once } = p;
  return <Tag className={className} style={style} {...data({ motion: "reveal", x, y, scale, delay, spring, trigger, amount, once })}>{children}</Tag>;
}

export function Nav({ children, className }: { children: ReactNode; className?: string }) {
  if (useVariant() === "framer") return <F.NavDrop className={className}>{children}</F.NavDrop>;
  return <header className={className} data-motion="nav">{children}</header>;
}

export function Zoom({ children, className }: { children?: ReactNode; className?: string }) {
  if (useVariant() === "framer") return <F.ZoomIn className={className}>{children}</F.ZoomIn>;
  return <div className={className} data-motion="zoom">{children}</div>;
}

export function Roll(p: F.RollButtonProps) {
  if (useVariant() === "framer") return <F.RollButton {...p} />;
  return <a href={p.href} className={p.className} style={p.style} data-motion="roll">{p.label}</a>;
}

export function Magnetic({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  if (useVariant() === "framer") return <F.Magnetic className={className} style={style}>{children}</F.Magnetic>;
  return <div className={className} style={style} data-motion="magnetic">{children}</div>;
}

export function MagneticLayer({ children, className, style }: { children?: ReactNode; className?: string; style?: CSSProperties }) {
  if (useVariant() === "framer") return <F.MagneticLayer className={className} style={style}>{children}</F.MagneticLayer>;
  return <div className={className} style={style} data-magnetic-layer="">{children}</div>;
}

export function Rotate({ children, className }: { children: ReactNode; className?: string }) {
  if (useVariant() === "framer") return <F.ScrollRotate className={className}>{children}</F.ScrollRotate>;
  return <div className={className} style={{ display: "inline-flex" }} data-motion="rotate">{children}</div>;
}

export function Track({ children, className, trackClassName }: { children: ReactNode; className?: string; trackClassName?: string }) {
  if (useVariant() === "framer") return <F.StickyTrack className={className} trackClassName={trackClassName}>{children}</F.StickyTrack>;
  return (
    <section className={className} style={{ position: "relative" }} data-motion="track">
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div className={trackClassName} style={{ display: "flex", width: "max-content" }} data-track="">{children}</div>
      </div>
    </section>
  );
}

export function Curtain({ children, className }: { children: ReactNode; className?: string }) {
  if (useVariant() === "framer") return <F.CurtainFooter className={className}>{children}</F.CurtainFooter>;
  return <footer className={className} data-motion="curtain">{children}</footer>;
}

export type TagProp = ElementType;
