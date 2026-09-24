import { defineConfig } from 'astro/config'

// Static, frontend-only site: no server, no API routes. `src/lib/mpt.ts`'s
// transaction builders are reused unmodified via a relative import into
// `../src/lib/mpt.ts`, so Vite needs permission to read outside `web/`.
//
// Deployed to a custom domain (carbon.theaha.co) at the domain root. `base`
// stays '/' -- src/lib/paths.ts's helpers are still used for every in-app
// URL so this can move back under a subpath again with only a config change.
// SITE_URL / BASE_PATH let a fork deploy the same build as a GitHub Pages
// project site (e.g. https://<user>.github.io/<repo>/); the defaults
// are the official deployment.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://carbon.theaha.co',
  base: process.env.BASE_PATH ?? '/',
  output: 'static',
  vite: {
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
})
