import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./demo.css";

// No StrictMode: the GSAP variant mutates DOM once (character splitting) and must not run twice.
const variant = new URLSearchParams(location.search).get("variant") === "gsap" ? "gsap" : "framer";
createRoot(document.getElementById("root")!).render(<App variant={variant} />);
