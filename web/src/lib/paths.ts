// The site is served from carbon.theaha.co, currently at the domain root
// (base "/"), so these helpers are no-ops for now -- but every in-app URL
// ("/sign", "/deployment.json") still goes through them so a future move
// back under a subpath is just an astro.config.mjs change.

/** Astro's configured `base`, always normalized to have no trailing slash. */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '')

/** Prefixes a root-absolute in-app path with the configured base. */
export function withBase(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return suffix === '/' ? `${BASE}/` : `${BASE}${suffix}`
}

/**
 * Same as `withBase`, but returns a fully-qualified URL. Used for the
 * signer handoff link, which is relayed out-of-band (chat, email) and so
 * has to carry origin + base, not just a path.
 */
export function absoluteUrlWithBase(path: string): string {
  return new URL(withBase(path), window.location.origin).toString()
}
