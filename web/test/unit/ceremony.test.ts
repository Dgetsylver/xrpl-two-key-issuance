import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ghostsigSignMock } = vi.hoisted(() => ({ ghostsigSignMock: vi.fn() }))

vi.mock('../../src/lib/ghostsig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/ghostsig')>()
  return { ...actual, ghostsigSign: ghostsigSignMock }
})

const { signCeremonyPayload } = await import('../../src/lib/ceremony')
const { urlParamToBlob } = await import('../../src/lib/blob')
const { GhostsigError } = await import('../../src/lib/ghostsig')

describe('signCeremonyPayload', () => {
  beforeEach(() => {
    ghostsigSignMock.mockReset()
  })

  it("hands off with result.blob, never result.handOver (which is a plain-English status message, not data)", async () => {
    const blobHex = 'AB'.repeat(150).toUpperCase()
    const quorumMessage = '1 of 2 by weight after this signature: hand the signed transaction to the next signer'
    ghostsigSignMock.mockResolvedValue({
      address: 'rSigner',
      publicKey: 'aa'.repeat(32),
      hash: 'HASH',
      blob: blobHex,
      signature: 'SIG',
      handOver: quorumMessage,
    })

    const outcome = await signCeremonyPayload({ TransactionType: 'Payment' }, 'rSigner')

    expect(outcome.status).toBe('handoff')
    if (outcome.status !== 'handoff') throw new Error('expected a handoff outcome')
    expect(outcome.blob).toBe(blobHex)
    expect(outcome.quorumStatus).toBe(quorumMessage)
    // The whole point: decoding the link's `b` param must recover the real
    // signed blob, not garbage from hex-decoding an English sentence.
    const param = new URL(outcome.shareUrl).searchParams.get('b')
    expect(param).not.toBeNull()
    expect(urlParamToBlob(param!)).toBe(blobHex)
  })

  it('reports submitted with the hash once quorum is met (no handOver on the result)', async () => {
    ghostsigSignMock.mockResolvedValue({
      address: 'rSigner',
      publicKey: 'aa'.repeat(32),
      hash: 'HASH123',
      blob: 'ANYBLOB',
      signature: 'SIG',
    })

    const outcome = await signCeremonyPayload({ TransactionType: 'Payment' }, 'rSigner')

    expect(outcome).toEqual({ status: 'submitted', hash: 'HASH123', address: 'rSigner' })
  })

  it('turns a GhostsigError into a plain error outcome', async () => {
    ghostsigSignMock.mockRejectedValue(new GhostsigError(-4, 'Declined'))

    const outcome = await signCeremonyPayload({ TransactionType: 'Payment' }, 'rSigner')

    expect(outcome).toEqual({ status: 'error', message: 'Declined' })
  })
})
