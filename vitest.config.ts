import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    env: {
      // testcontainers' Ryuk reaper container tries to bind-mount the Docker
      // socket for cleanup; colima's Lima VM doesn't support that bind mount
      // the way Docker Desktop does, which fails container startup entirely.
      // We already call teardown() explicitly in every afterAll, so Ryuk
      // (an extra safety net for crashed test runs) isn't required here.
      TESTCONTAINERS_RYUK_DISABLED: 'true',
    },
    // Integration tests spin up a real stand-alone rippled container and submit
    // real transactions; give them generous time to avoid flakiness.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // These tests share one Docker container per file; run files in sequence so
    // ledger state (accounts, sequences) doesn't collide across parallel workers.
    fileParallelism: false,
  },
})
