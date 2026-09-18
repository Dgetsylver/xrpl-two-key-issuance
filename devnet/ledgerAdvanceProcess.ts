import { startLedgerAdvanceLoop } from './ledgerAdvance.js'

/**
 * Entry point for the detached background process spawned by
 * `npm run devnet:up` (see `devnet/cli.ts`). Not meant to be run
 * directly -- it just keeps `startLedgerAdvanceLoop` alive until this
 * process is killed (by `npm run devnet:down`, or when the machine/terminal
 * session ends).
 */
async function main(): Promise<void> {
  const wsUrl = process.argv[2]
  if (!wsUrl) {
    throw new Error('Usage: ledgerAdvanceProcess.ts <wsUrl>')
  }

  const loop = await startLedgerAdvanceLoop(wsUrl)

  const shutdown = (): void => {
    loop.stop().finally(() => process.exit(0))
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
