/**
 * Vendored, adapted copy of `ghostsig/sdk/popup.ts` (the GHOSTSIG protocol's
 * app-side popup client), from the GhostSig passkey wallet project
 * (https://ghostsig.dev). Reproduced here because this app has no npm
 * dependency on GhostSig -- the documented, dependency-free integration
 * surface is exactly this popup `postMessage` protocol, not the unmerged
 * `xrpl-connect` adapter fork.
 *
 * The protocol logic below (message shapes, timeouts, popup reuse window,
 * error codes) is kept unchanged from the original so this stays
 * interoperable with the real https://ghostsig.dev. Only the `// ghostsig-
 * popup:begin/end` sync markers were dropped and minor adjustments made for
 * this project's TypeScript config (e.g. explicit exports).
 *
 * The app opens https://ghostsig.dev/?connect as a popup, inside the user's
 * click. The popup posts { ghostsig: 1, type: 'ready' } to its opener. The
 * app answers with one request { ghostsig: 1, id, type: 'request', method,
 * chain, network, params }. The page replies to the opener alone, with
 * { ghostsig: 1, id, type: 'result', result } or { ghostsig: 1, id, type:
 * 'error', error: { code, message } }, the codes being SEP-43's. The page
 * closes itself once it has signed. A connect leaves it open for a moment,
 * so the signature a login asks for next needs no second window.open.
 */

const GHOSTSIG_PROTOCOL = 1
export const GHOSTSIG_URL = 'https://ghostsig.dev/?connect'
/** How long a connect's popup is reused. The page holds it open a little longer than this. */
const GHOSTSIG_REUSE_MS = 1_500
const GHOSTSIG_READY_MS = 10_000
const GHOSTSIG_TIMEOUT_MS = 60_000

/** SEP-43 codes: -1 internal, -2 external service, -3 bad request or unsupported, -4 rejected. */
export type GhostsigCode = -1 | -2 | -3 | -4
export type GhostsigExt =
  | 'popup_blocked'
  | 'popup_closed'
  | 'timeout'
  | 'unreachable'
  | 'account_mismatch'
  | 'bad_reply'

export class GhostsigError extends Error {
  readonly code: GhostsigCode
  readonly ext?: GhostsigExt
  constructor(code: GhostsigCode, message: string, ext?: GhostsigExt) {
    super(message)
    this.name = 'GhostsigError'
    this.code = code
    if (ext) this.ext = ext
  }
}

export interface GhostsigConnectResult {
  address: string
  publicKey: string
}
export interface GhostsigSubmitted {
  kind: string
  code?: string
  ledger?: number | string
  ok?: boolean
}
export interface GhostsigSignResult extends GhostsigConnectResult {
  hash: string
  blob: string
  signature: string
  handOver?: string
  submitted?: GhostsigSubmitted
}

export interface GhostsigRequest {
  chain: string
  network: string
  method: string
  params?: Record<string, unknown>
  url?: string
  timeoutMs?: number
}

/** The popup a connect left open, for the signature a login asks for next. */
const ghostsigHeld = new WeakMap<Window, { popup: Window; origin: string; at: number }>()

/** The pages this client opens: ghostsig.dev, or a copy on localhost, its own passkey relying party. */
function ghostsigPageUrl(url: string | undefined): URL | GhostsigError {
  let parsed: URL
  try {
    parsed = new URL(url ?? GHOSTSIG_URL)
  } catch {
    return new GhostsigError(-3, `"${String(url)}" is not a URL`)
  }
  if (parsed.origin === new URL(GHOSTSIG_URL).origin) return parsed
  if (parsed.hostname === 'localhost' && parsed.protocol === 'http:') return parsed
  return new GhostsigError(-3, `GHOSTSIG is at ${new URL(GHOSTSIG_URL).origin}. A copy at ${parsed.origin} is not opened`)
}

function ghostsigFeatures(win: Window): string {
  const width = 420
  const height = 720
  const outerW = win.outerWidth || win.screen?.width || width
  const outerH = win.outerHeight || win.screen?.height || height
  const left = Math.max(0, Math.round((win.screenX || 0) + (outerW - width) / 2))
  const top = Math.max(0, Math.round((win.screenY || 0) + (outerH - height) / 2))
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
}

function ghostsigId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function ghostsigCheckResult(method: string, params: Record<string, unknown>, result: unknown): GhostsigError | null {
  const r = result as Record<string, unknown> | null
  const str = (k: string) => typeof r?.[k] === 'string' && (r[k] as string).length > 0
  if (!r || typeof r !== 'object' || !str('address') || !/^[0-9a-f]{64}$/i.test(String(r.publicKey))) {
    return new GhostsigError(-1, 'GHOSTSIG answered without an address and a public key', 'bad_reply')
  }
  if (method !== 'connect' && !str('signature')) {
    return new GhostsigError(-1, 'GHOSTSIG answered without a signature', 'bad_reply')
  }
  if (method === 'sign' && !(str('hash') && str('blob'))) {
    return new GhostsigError(-1, 'GHOSTSIG answered without the signed transaction', 'bad_reply')
  }
  if (typeof params.address === 'string' && params.address !== r.address) {
    return new GhostsigError(-1, `GHOSTSIG signed as ${String(r.address)}, not as ${params.address}`, 'account_mismatch')
  }
  return null
}

/** One request to the page. Never throws: every failure is a rejection with a GhostsigError. */
export function ghostsigRequest<T = unknown>(req: GhostsigRequest): Promise<T> {
  const win = typeof window === 'undefined' ? undefined : window
  if (!win || typeof win.open !== 'function') {
    return Promise.reject(new GhostsigError(-1, 'This environment cannot open a popup', 'popup_blocked'))
  }
  const page = ghostsigPageUrl(req.url)
  if (page instanceof GhostsigError) return Promise.reject(page)
  const url = page.href
  const origin = page.origin
  const params = req.params ?? {}
  const timeoutMs = req.timeoutMs ?? GHOSTSIG_TIMEOUT_MS

  const held = ghostsigHeld.get(win)
  ghostsigHeld.delete(win)
  const reuse = held !== undefined && !held.popup.closed && held.origin === origin && Date.now() - held.at < GHOSTSIG_REUSE_MS
  let popup: Window | null
  if (reuse) {
    popup = held!.popup
  } else {
    // A random window name. A fixed one would let any frame on the app's page take the popup over.
    try {
      popup = win.open(url, `ghostsig-${ghostsigId()}`, ghostsigFeatures(win))
    } catch {
      popup = null
    }
    if (!popup || popup.closed) {
      return Promise.reject(
        new GhostsigError(-1, 'The browser blocked the GHOSTSIG popup. Allow popups for this site and try again', 'popup_blocked'),
      )
    }
  }
  const opened = popup

  const id = ghostsigId()
  const request = {
    ghostsig: GHOSTSIG_PROTOCOL,
    id,
    type: 'request',
    method: req.method,
    chain: req.chain,
    network: req.network,
    params,
  }

  return new Promise<T>((resolve, reject) => {
    let done = false
    let posted = reuse
    const finish = (err: GhostsigError | null, value?: T) => {
      if (done) return
      done = true
      win.removeEventListener('message', onMessage)
      clearInterval(poll)
      clearTimeout(readyTimer)
      clearTimeout(timer)
      // A connect leaves the page open. A failure of the client's own closes the popup;
      // a page that refused keeps it, to show why.
      if (!err && req.method === 'connect') {
        ghostsigHeld.set(win, { popup: opened, origin, at: Date.now() })
      } else if (err?.ext) {
        try {
          if (!opened.closed) opened.close()
        } catch {
          // a foreign window
        }
      }
      if (err) reject(err)
      else resolve(value as T)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== opened) return
      const data = event.data as Record<string, unknown> | null
      if (!data || typeof data !== 'object' || data.ghostsig !== GHOSTSIG_PROTOCOL) return
      if (data.type === 'ready') {
        posted = true
        opened.postMessage(request, origin)
        return
      }
      if (data.id !== id) return
      if (data.type === 'result') {
        const bad = ghostsigCheckResult(req.method, params, data.result)
        if (bad) finish(bad)
        else finish(null, data.result as T)
      } else if (data.type === 'error') {
        const e = data.error as { code?: unknown; message?: unknown } | undefined
        const code = ([-1, -2, -3, -4] as const).find((c) => c === e?.code) ?? -1
        finish(new GhostsigError(code, typeof e?.message === 'string' ? e.message : 'GHOSTSIG refused the request'))
      }
    }
    win.addEventListener('message', onMessage)
    if (reuse) opened.postMessage(request, origin)
    const poll = setInterval(() => {
      if (opened.closed) {
        finish(new GhostsigError(-4, 'The GHOSTSIG popup was closed before it answered', 'popup_closed'))
      }
    }, 500)
    const readyTimer = setTimeout(
      () => {
        if (!posted) {
          finish(
            new GhostsigError(
              -1,
              'GHOSTSIG did not answer. The popup lost its opener (a Cross-Origin-Opener-Policy of same-origin does that), or the page is not GHOSTSIG',
              'unreachable',
            ),
          )
        }
      },
      Math.min(GHOSTSIG_READY_MS, timeoutMs),
    )
    const timer = setTimeout(() => finish(new GhostsigError(-1, 'GHOSTSIG did not answer in time', 'timeout')), timeoutMs)
  })
}

// --- Thin, app-specific wrappers on top of the vendored client above -----

const CHAIN = 'xrpl'
const NETWORK = 'testnet'

/**
 * Opens the GHOSTSIG popup and connects a passkey-derived XRPL address.
 * Must be called synchronously from a user gesture (e.g. a click handler),
 * since the popup has to open inside the click.
 */
export function ghostsigConnect(): Promise<GhostsigConnectResult> {
  return ghostsigRequest<GhostsigConnectResult>({ method: 'connect', chain: CHAIN, network: NETWORK })
}

export interface GhostsigSignParams {
  /** The unsigned (or partially co-signed) transaction, as JSON. */
  payload: Record<string, unknown>
  /** Which address is expected to sign. GHOSTSIG double-checks this. */
  address: string
  /**
   * Always safe to pass `true`: GHOSTSIG only actually submits once its own
   * quorum check on the *live* SignerList passes. Below quorum it just
   * returns `{ blob, handOver }` instead of submitting.
   */
  submit?: boolean
}

/**
 * Signs (and, once quorum is met, submits) an XRPL transaction via GHOSTSIG.
 * Works for both single-sig transactions (MPTokenAuthorize, a plain
 * Payment) and multisig co-signing contributions (a Payment whose
 * `SigningPubKey` is empty, or which already carries a `Signers` array) --
 * GHOSTSIG detects which case it is from the payload's shape.
 */
export function ghostsigSign(params: GhostsigSignParams): Promise<GhostsigSignResult> {
  return ghostsigRequest<GhostsigSignResult>({
    method: 'sign',
    chain: CHAIN,
    network: NETWORK,
    params: {
      payload: JSON.stringify(params.payload),
      submit: params.submit ?? true,
      address: params.address,
    },
  })
}
