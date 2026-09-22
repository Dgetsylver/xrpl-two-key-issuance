import { beforeEach, describe, expect, it, vi } from 'vitest'

const { computeMultisigFeeDropsMock, getAccountSequenceMock } = vi.hoisted(() => ({
  computeMultisigFeeDropsMock: vi.fn(),
  getAccountSequenceMock: vi.fn(),
}))

vi.mock('../../src/lib/xrplClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/xrplClient')>()
  return {
    ...actual,
    computeMultisigFeeDrops: computeMultisigFeeDropsMock,
    getAccountSequence: getAccountSequenceMock,
  }
})

const { buildProposalPaymentTx } = await import('../../src/lib/tx')

describe('buildProposalPaymentTx', () => {
  beforeEach(() => {
    computeMultisigFeeDropsMock.mockReset()
    getAccountSequenceMock.mockReset()
  })

  it('sets Sequence and Fee explicitly, and clears SigningPubKey, before GhostSig is ever called', async () => {
    computeMultisigFeeDropsMock.mockResolvedValue('30')
    getAccountSequenceMock.mockResolvedValue(42)

    const tx = await buildProposalPaymentTx('rIssuer', 'rGovernance', 'ABCDEF0123456789', '100', 2)

    // GhostSig refuses to autofill Sequence for a multisig-shaped payload
    // ("a multi-signed transaction is fixed by its first signer, so add
    // it") -- this is exactly the field that was missing before.
    expect(tx.Sequence).toBe(42)
    expect(tx.Fee).toBe('30')
    expect(tx.SigningPubKey).toBe('')
    expect(tx.LastLedgerSequence).toBeUndefined()
    expect(getAccountSequenceMock).toHaveBeenCalledWith('rIssuer')
    expect(computeMultisigFeeDropsMock).toHaveBeenCalledWith(2)
  })

  it('includes a memo when one is given', async () => {
    computeMultisigFeeDropsMock.mockResolvedValue('30')
    getAccountSequenceMock.mockResolvedValue(1)

    const tx = await buildProposalPaymentTx('rIssuer', 'rGovernance', 'ABCDEF0123456789', '100', 2, {
      type: 'mint-period',
      data: '2027',
    })

    expect(tx.Memos).toEqual([
      {
        Memo: {
          MemoType: '6D696E742D706572696F64',
          MemoData: '32303237',
        },
      },
    ])
  })
})
