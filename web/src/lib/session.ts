/**
 * Astro's pages are plain full-page loads between routes (no client-side
 * router), so a module-level variable holding the connected GhostSig
 * address resets on every navigation. This persists that (public,
 * non-secret) address across pages/reloads so visitors aren't forced back
 * through a fresh "Connect with GhostSig" popup just to be recognized
 * again -- only actually *signing* a transaction ever needs a live GhostSig
 * ceremony, which this does not skip or cache.
 */
const KEY = 'carbonCoin:ghostsigAddress'

export function getStoredAddress(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setStoredAddress(address: string): void {
  try {
    localStorage.setItem(KEY, address)
  } catch {
    // Storage unavailable (private browsing, disabled cookies, etc.) -- the
    // page still works, it just won't remember you across navigations.
  }
}

export function clearStoredAddress(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
