// The site is served from a subpath (https://theaha.co/carbon-coin/), so no
// root-absolute URL ("/sign", "/deployment.json") is correct on its own --
// each one has to be prefixed with Astro's configured `base`. These helpers
// centralize that so the same source works under any base, including "/".

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
