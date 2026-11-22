import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const brand = fileURLToPath(new URL("../../../../brand", import.meta.url));
const motion = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@brand": brand } },
  server: { port: 5178, fs: { allow: [".", brand, motion] } },
});
