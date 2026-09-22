import { defineConfig } from 'astro/config'

// Static, frontend-only site: no server, no API routes. `src/lib/mpt.ts`'s
// transaction builders are reused unmodified via a relative import into
// `../src/lib/mpt.ts`, so Vite needs permission to read outside `web/`.
export default defineConfig({
  output: 'static',
  vite: {
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
})
