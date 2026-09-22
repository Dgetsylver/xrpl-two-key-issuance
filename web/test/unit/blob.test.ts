import { describe, expect, it } from 'vitest'
import { blobToUrlParam, urlParamToBlob } from '../../src/lib/blob'

describe('blob <-> URL param round-trip', () => {
  it('round-trips a short hex blob byte-for-byte, and is URL-safe', () => {
    const hex = 'DEADBEEF00FF1234567890ABCDEF'
    const param = blobToUrlParam(hex)

    expect(param).not.toMatch(/[+/=]/) // base64url: no '+', '/', or '=' padding
    expect(urlParamToBlob(param)).toBe(hex)
  })

  it('round-trips a realistic-length (200-byte) transaction blob', () => {
    const hex = Array.from({ length: 200 }, (_, i) => (i % 256).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

    const param = blobToUrlParam(hex)

    expect(urlParamToBlob(param)).toBe(hex)
  })
})
