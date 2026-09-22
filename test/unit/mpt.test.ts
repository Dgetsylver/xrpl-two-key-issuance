import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMptPaymentTx } from '../../src/lib/mpt.js'

describe('mpt.ts memo encoding (browser compatibility)', () => {
  const originalBuffer = globalThis.Buffer

  beforeEach(() => {
    // `mpt.ts` is reused unmodified in the browser bundle under `web/`,
    // where Node's `Buffer` global does not exist. Deleting it here
    // reproduces that environment exactly, so a future edit that
    // reintroduces a `Buffer` dependency fails this test instead of only
    // failing silently in a real browser (as it did before this was caught).
    // @ts-expect-error -- deliberately removing a Node global for the test
    delete globalThis.Buffer
  })

  afterEach(() => {
    globalThis.Buffer = originalBuffer
  })

  it('encodes a memo without referencing the Node Buffer global', () => {
    const tx = buildMptPaymentTx('rFrom', 'rTo', 'ABCDEF0123456789', '100', {
      type: 'mint-period',
      data: '2027',
    })

    expect(tx.Memos).toEqual([
      {
        Memo: {
          MemoType: '6D696E742D706572696F64', // 'mint-period'
          MemoData: '32303237', // '2027'
        },
      },
    ])
  })

  it('omits Memos entirely when no memo is given', () => {
    const tx = buildMptPaymentTx('rFrom', 'rTo', 'ABCDEF0123456789', '100')
    expect(tx.Memos).toBeUndefined()
  })
})
