// Local target for `npm run e2e`: builds the web app, applies the D1 migrations to a throwaway local
// database and runs the Worker with `wrangler dev`, so the suite clicks through the same Worker that
// serves production (static assets plus /api). Playwright starts and stops this script (webServer).
// E2E_SKIP_BUILD=1 skips the build when apps/web/dist is fresh, as in deploy:check.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const worker = join(root, 'worker')
const port = process.env.E2E_PORT ?? '8797'

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`e2e serve: ${command} ${args.join(' ')} failed`)
    process.exit(result.status ?? 1)
  }
}

if (process.env.E2E_SKIP_BUILD === '1' && existsSync(join(root, 'apps/web/dist/index.html'))) {
  console.log('e2e serve: E2E_SKIP_BUILD=1, using the existing apps/web/dist')
} else {
  run('npm', ['run', 'build', '--prefix', 'apps/web'], root)
}

// A fresh database per run: no state from local development or an earlier run leaks in.
const state = mkdtempSync(join(tmpdir(), 'wohin-e2e-'))
const cleanup = () => rmSync(state, { recursive: true, force: true })
const envFile = ['--env-file', '.dev.vars.example']

run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state, ...envFile], worker)

const dev = spawn(
  'npx',
  ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', port, '--persist-to', state, '--show-interactive-dev-session=false', ...envFile],
  { cwd: worker, stdio: 'inherit' },
)
dev.on('exit', (code) => {
  cleanup()
  process.exit(code ?? 0)
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => dev.kill(signal))
}
