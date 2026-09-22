/**
 * Shared "Connect with GhostSig" control. `initConnectHeader()` is called
 * once, from Layout.astro, and owns the actual popup call, storage, and the
 * header's button/status markup -- every page used to duplicate all of
 * this itself. Pages that need to react to the connected address (role
 * checks, showing a form, refreshing balances, etc.) subscribe via
 * `onConnectionChange` instead.
 *
 * This works across Layout's `<script>` and a page's own `<script>` with no
 * DOM events: Astro/Vite treats both as importing the same ESM module
 * within one page load, so the `listeners` set below is a true singleton
 * for the lifetime of that page -- it only resets on a real navigation,
 * same as everything else in a per-page script.
 */
import { ghostsigConnect, GhostsigError } from './ghostsig'
import { getStoredAddress, setStoredAddress, clearStoredAddress } from './session'
import { loadPublicConfig, isIssuerSigner, isGovernanceSigner } from './config'

export type ConnectionListener = (address: string | null) => void

const listeners = new Set<ConnectionListener>()

function notify(address: string | null): void {
  for (const listener of listeners) listener(address)
}

/** Invokes `listener` immediately with the current address (or `null`), then again on every connect/disconnect. */
export function onConnectionChange(listener: ConnectionListener): void {
  listeners.add(listener)
  listener(getStoredAddress())
}

/**
 * Wires up the header's "Connect with GhostSig" button, status text, and
 * disconnect control. Call once, from Layout.astro; pages never call this
 * themselves.
 */
export function initConnectHeader(): void {
  const button = document.getElementById('header-connect-button') as HTMLButtonElement | null
  const status = document.getElementById('header-connect-status')
  if (!button || !status) return

  async function render(address: string | null): Promise<void> {
    if (!address) {
      button!.style.display = 'inline-block'
      status!.textContent = 'Not connected.'
      return
    }
    button!.style.display = 'none'
    let roleSuffix = ''
    try {
      const config = await loadPublicConfig()
      const roles: string[] = []
      if (isIssuerSigner(config, address)) roles.push('Mint Signer')
      if (isGovernanceSigner(config, address)) roles.push('Governance Signer')
      if (roles.length > 0) roleSuffix = ` — ${roles.join(' & ')}`
    } catch {
      // Config didn't load yet; still show the address without role badges.
    }
    status!.innerHTML = `<span class="mono address">${address}</span>${roleSuffix} · <button type="button" id="header-disconnect-button" class="link-button">disconnect</button>`
    document.getElementById('header-disconnect-button')?.addEventListener('click', () => {
      clearStoredAddress()
      notify(null)
    })
  }

  onConnectionChange(render)

  button.addEventListener('click', async () => {
    button.disabled = true
    try {
      const { address } = await ghostsigConnect()
      setStoredAddress(address)
      notify(address)
    } catch (err) {
      status.textContent = err instanceof GhostsigError ? err.message : err instanceof Error ? err.message : String(err)
    } finally {
      button.disabled = false
    }
  })
}
