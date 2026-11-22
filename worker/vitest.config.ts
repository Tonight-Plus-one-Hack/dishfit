import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    // Same as the Text rule for *.geojson in wrangler.jsonc: the file's content as a string.
    {
      name: "geojson-as-text",
      transform(code: string, id: string) {
        return id.endsWith(".geojson") ? { code: `export default ${JSON.stringify(code)};`, map: null } : undefined;
      },
    },
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          ADMIN_TOKEN: "test-admin-token",
          NUMBERS_SINCE: "2026-11-21T22:00:00.000Z",
        },
        // Only for the R2 adapter test (src/lib/photo-store.ts r2PhotoStore); the Worker itself binds no R2.
        r2Buckets: ["TEST_R2"],
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    testTimeout: 20_000,
  },
});
