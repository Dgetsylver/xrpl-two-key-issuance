import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { Client } from 'xrpl'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RIPPLED_CFG_PATH = path.resolve(__dirname, 'rippled.cfg')
const WS_ADMIN_PORT = 6006

export interface StartedRippledNode {
  /** WebSocket URL of the running stand-alone node. */
  wsUrl: string
  /** The underlying testcontainers handle, for callers that need to stop it directly. */
  container: StartedTestContainer
}

export interface StartRippledNodeOptions {
  /**
   * Bind the node's WS admin port to a fixed host port (e.g. 6006, matching
   * `network.ts`'s default local URL) instead of a dynamically-assigned one.
   * Used by `npm run devnet:up` so scripts/tests can rely on the well-known
   * `ws://localhost:6006` without needing to discover a port. Integration
   * tests omit this to get a dynamically-mapped port, so each test file's
   * disposable node can't collide with another file's, or with a real
   * `devnet:up` node the developer left running.
   */
  hostPort?: number
}

/**
 * Starts a fresh, disposable stand-alone rippled node in Docker (via
 * `testcontainers`), and waits for it to actually accept WebSocket RPC
 * calls. Shared by the integration test helper (see
 * `test/helpers/localNetwork.ts`) and `devnet/cli.ts`, which were
 * previously two separate implementations of the same "start a stand-alone
 * rippled node" logic (one via `testcontainers`, one via a
 * docker-compose.yml file).
 */
export async function startRippledNode(options: StartRippledNodeOptions = {}): Promise<StartedRippledNode> {
  let container = new GenericContainer('rippleci/rippled:latest')
    .withPlatform('linux/amd64')
    .withCommand(['--standalone', '--start', '--conf', '/etc/opt/ripple/rippled.cfg'])
    .withBindMounts([{ source: RIPPLED_CFG_PATH, target: '/etc/opt/ripple/rippled.cfg', mode: 'ro' }])
    .withStartupTimeout(60_000)

  container = options.hostPort
    ? container.withExposedPorts({ container: WS_ADMIN_PORT, host: options.hostPort })
    : container.withExposedPorts(WS_ADMIN_PORT)

  const started = await container.start()
  const wsUrl = `ws://${started.getHost()}:${started.getMappedPort(WS_ADMIN_PORT)}`
  await waitUntilReady(wsUrl)

  return { wsUrl, container: started }
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
