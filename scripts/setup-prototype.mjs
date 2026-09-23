import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const pin = JSON.parse(readFileSync(new URL('../prototype.json', import.meta.url), 'utf8'))
const directory = fileURLToPath(new URL('../.prototype/xrpl.js', import.meta.url))
const run = (command, args, cwd = directory) => execFileSync(command, args, { cwd, stdio: 'inherit' })
mkdirSync(new URL('../.prototype/', import.meta.url), { recursive: true })
if (!existsSync(directory)) {
  run('git', ['clone', '--no-checkout', '--filter=blob:none', pin.repository, directory], root)
} else {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: directory, encoding: 'utf8' })
  if (dirty.trim()) throw new Error('The prototype checkout has local changes; save them before running setup.')
}
run('git', ['fetch', '--depth=1', 'origin', pin.commit])
run('git', ['checkout', '--detach', pin.commit])
run('npm', ['ci'])
run('npm', ['run', 'build'])
console.log(`Built aha xrpl.js prototype at ${pin.commit}. Next: npm ci && npm --prefix web ci`)
