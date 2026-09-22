import { defineConfig } from 'astro/config'

// Static, frontend-only site: no server, no API routes. `src/lib/mpt.ts`'s
// transaction builders are reused unmodified via a relative import into
// `../src/lib/mpt.ts`, so Vite needs permission to read outside `web/`.
//
// Deployed to a custom domain (carbon.theaha.co) at the domain root. `base`
// stays '/' -- src/lib/paths.ts's helpers are still used for every in-app
// URL so this can move back under a subpath again with only a config change.
export default defineConfig({
  site: 'https://carbon.theaha.co',
  base: '/',
  output: 'static',
  vite: {
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
})
