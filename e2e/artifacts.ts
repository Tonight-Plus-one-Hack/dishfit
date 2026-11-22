import { resolve } from 'node:path'

/** Screenshots per step, the HTML report and failure traces. Override with E2E_ARTIFACTS_DIR. */
export const artifactsDir = resolve(process.env.E2E_ARTIFACTS_DIR ?? resolve(import.meta.dirname, 'artifacts'))
