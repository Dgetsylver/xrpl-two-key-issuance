import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The rippled container started here is meant to outlive this script's
// process (the developer runs `devnet:up`, then separate `npm run
// setup:issuer` etc. invocations later). testcontainers' Ryuk reaper
// assumes the opposite -- it kills a session's containers as soon as the
// process that started them disconnects -- so it must be disabled before
// `startRippledNode` (imported below) ever touches testcontainers. Compare
// to `vitest.config.ts`, which disables Ryuk for the same reason but
// because tests call `teardown()` explicitly instead.
process.env.TESTCONTAINERS_RYUK_DISABLED = 'true'

const { startRippledNode } = await import('./rippledNode.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.resolve(process.cwd(), '.devnet.json')
const WS_PORT = 6006

interface DevnetState {
  containerId: string
  ledgerAdvancePid: number
}

async function up(): Promise<void> {
  if (existsSync(STATE_FILE)) {
    console.log('Local devnet already running (found .devnet.json). Run `npm run devnet:down` first.')
    return
  }

  const { wsUrl, container } = await startRippledNode({ hostPort: WS_PORT })
  console.log(`Started stand-alone rippled node: ${wsUrl}`)

  // Spawned detached and unref'd so the ledger-advance loop keeps running
  // after this script exits -- stand-alone rippled never closes ledgers on
  // its own, and the devnet is meant to stay up across many separate
  // script invocations.
  const ledgerAdvanceScript = path.resolve(__dirname, 'ledgerAdvanceProcess.ts')
  const child = spawn('tsx', [ledgerAdvanceScript, wsUrl], { detached: true, stdio: 'ignore' })
  child.unref()
  if (!child.pid) {
    throw new Error('Failed to spawn the ledger-advance background process.')
  }

  const state: DevnetState = { containerId: container.getId(), ledgerAdvancePid: child.pid }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8')
  console.log('Ledger-advance loop started in the background.')
  console.log('Run `npm run devnet:down` when done to stop both.')
}

async function down(): Promise<void> {
  if (!existsSync(STATE_FILE)) {
    console.log('No local devnet state found (nothing to stop).')
    return
  }
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as DevnetState

  try {
    process.kill(state.ledgerAdvancePid, 'SIGTERM')
  } catch {
    // Already exited; nothing to do.
  }

  await new Promise<void>((resolve, reject) => {
    const dockerRm = spawn('docker', ['rm', '-f', state.containerId], { stdio: 'inherit' })
    dockerRm.on('error', reject)
    dockerRm.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`\`docker rm\` exited with code ${code}`))))
  })

  unlinkSync(STATE_FILE)
  console.log('Stopped the local devnet.')
}

const command = process.argv[2]
if (command === 'up') {
  await up()
} else if (command === 'down') {
  await down()
} else {
  console.error('Usage: tsx devnet/cli.ts <up|down>')
  process.exitCode = 1
}
