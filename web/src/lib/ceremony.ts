import { GhostsigError, ghostsigSign } from './ghostsig'
import { blobToUrlParam } from './blob'
import { absoluteUrlWithBase } from './paths'
import type { PaymentPreview } from './preview'

export type CeremonyOutcome =
  | { status: 'submitted'; hash: string; address: string }
  | { status: 'handoff'; shareUrl: string; blob: string; address: string }
  | { status: 'error'; message: string }

/**
 * Signs `payload` as `address` via GHOSTSIG and interprets the result: once
 * quorum is met GHOSTSIG submits itself (`submitted`); otherwise it hands
 * back a partially-signed blob for the next signer (`handoff`). This single
 * function backs both "Propose" (the first signature) and `/sign` (every
 * subsequent one) -- there's no other difference between them.
 */
export async function signCeremonyPayload(payload: Record<string, unknown>, address: string): Promise<CeremonyOutcome> {
  try {
    const result = await ghostsigSign({ payload, address, submit: true })
    if (result.handOver) {
      const shareUrl = `${absoluteUrlWithBase('/sign')}?b=${blobToUrlParam(result.handOver)}`
      return { status: 'handoff', shareUrl, blob: result.handOver, address: result.address }
    }
    return { status: 'submitted', hash: result.hash, address: result.address }
  } catch (err) {
    if (err instanceof GhostsigError) {
      return { status: 'error', message: err.message }
    }
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/** A full, self-explanatory message for a proposer to relay however they like (chat, email, a shared channel). */
export function buildHandoffMessage(preview: PaymentPreview, shareUrl: string): string {
  return `I'm proposing we ${preview.summary.replace(/\.$/, '')} — add your signature: ${shareUrl}`
}
