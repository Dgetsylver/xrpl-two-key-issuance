import { startRippledNode } from '../../devnet/rippledNode.js'
import { startLedgerAdvanceLoop } from '../../devnet/ledgerAdvance.js'

export interface LocalNetworkHandle {
  /** WebSocket URL of the running stand-alone node (dynamically-mapped host port). */
  wsUrl: string
  /** Stops the ledger-advance interval, disconnects, and stops the container. */
  teardown: () => Promise<void>
}

/**
 * Starts a fresh, disposable stand-alone rippled node in Docker, waits for
 * it to actually accept WebSocket RPC calls, and keeps its ledger
 * auto-advancing (stand-alone mode never closes ledgers on its own) for the
 * lifetime of the returned handle. Thin wrapper around the shared
 * `devnet/rippledNode.ts` and `devnet/ledgerAdvance.ts` helpers, which
 * `npm run devnet:up` also uses.
 *
 * Intended for one call per test file's `beforeAll`, paired with
 * `handle.teardown()` in `afterAll`.
 */
export async function startLocalNetwork(): Promise<LocalNetworkHandle> {
  const { wsUrl, container } = await startRippledNode()
  const ledgerAdvance = await startLedgerAdvanceLoop(wsUrl)

  const teardown = async (): Promise<void> => {
    await ledgerAdvance.stop()
    await container.stop()
  }

  return { wsUrl, teardown }
}
