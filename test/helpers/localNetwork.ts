import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GenericContainer } from 'testcontainers'
import { Client } from 'xrpl'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RIPPLED_CFG_PATH = path.resolve(__dirname, '../../docker/rippled.cfg')

export interface LocalNetworkHandle {
  /** WebSocket URL of the running stand-alone node (dynamically-mapped host port). */
  wsUrl: string
  /** Stops the ledger-advance interval, disconnects, and stops the container. */
  teardown: () => Promise<void>
}

/**
 * Starts a fresh, disposable stand-alone rippled node in Docker (via
 * `testcontainers`), waits for it to actually accept WebSocket RPC calls,
 * and keeps its ledger auto-advancing (stand-alone mode never closes
 * ledgers on its own) for the lifetime of the returned handle.
 *
 * Intended for one call per test file's `beforeAll`, paired with
 * `handle.teardown()` in `afterAll`.
 */
export async function startLocalNetwork(): Promise<LocalNetworkHandle> {
  const container = await new GenericContainer('rippleci/rippled:latest')
    .withPlatform('linux/amd64')
    .withCommand(['--standalone', '--start', '--conf', '/etc/opt/ripple/rippled.cfg'])
    .withBindMounts([{ source: RIPPLED_CFG_PATH, target: '/etc/opt/ripple/rippled.cfg', mode: 'ro' }])
    .withExposedPorts(6006)
    .withStartupTimeout(60_000)
    .start()

  const wsUrl = `ws://${container.getHost()}:${container.getMappedPort(6006)}`
  await waitUntilReady(wsUrl)

  const advanceClient = new Client(wsUrl)
  await advanceClient.connect()
  const interval = setInterval(() => {
    // ledger_accept is an admin-only stand-alone-mode command not modeled in
    // xrpl.js's public Request union, hence the cast.
    advanceClient.request({ command: 'ledger_accept' } as Parameters<typeof advanceClient.request>[0]).catch(() => {})
  }, 500)

  const teardown = async (): Promise<void> => {
    clearInterval(interval)
    await advanceClient.disconnect().catch(() => {})
    await container.stop()
  }

  return { wsUrl, teardown }
}

/**
 * `testcontainers`' default "listening port" wait strategy can resolve
 * slightly before rippled's WS/RPC layer is fully able to answer requests.
 * This polls a real `server_info` call until it succeeds.
 */
async function waitUntilReady(wsUrl: string, attempts = 40, delayMs = 500): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const client = new Client(wsUrl)
    try {
      await client.connect()
      await client.request({ command: 'server_info' })
      await client.disconnect()
      return
    } catch {
      await client.disconnect().catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw new Error(`Local rippled node at ${wsUrl} did not become ready in time.`)
}
