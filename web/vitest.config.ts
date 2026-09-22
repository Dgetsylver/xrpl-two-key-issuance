import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    // ceremony.ts reads `window.location.origin`; jsdom gives every test a
    // browser-shaped global scope so that works without per-file overrides.
    environment: 'jsdom',
  },
})
