import { defineConfig } from 'astro/config'

// Static, frontend-only site: no server, no API routes. `src/lib/mpt.ts`'s
// transaction builders are reused unmodified via a relative import into
// `../src/lib/mpt.ts`, so Vite needs permission to read outside `web/`.
//
// Deployed to a custom domain (theaha.co/carbon-coin), so the site lives at
// a subpath. Every in-app URL goes through `src/lib/paths.ts` to pick this up.
export default defineConfig({
  site: 'https://theaha.co',
  base: '/carbon-coin',
  output: 'static',
  vite: {
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
})
