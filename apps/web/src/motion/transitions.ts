// framer-motion transitions built from the spring tokens (kept apart from framer.tsx so that file only exports components).
import type { Transition } from "framer-motion";
import { s, spring, type SpringToken } from "./tokens";

export type SpringName = "appear" | "text" | "textQuick" | "nav" | "zoom" | "state";

/** framer-motion transition for a duration-based spring token. */
export const springTransition = (name: SpringName, delayMs = 0): Transition => {
  const token: SpringToken = spring[name];
  return { type: "spring", duration: token.duration, bounce: token.bounce, delay: s(delayMs) };
};
