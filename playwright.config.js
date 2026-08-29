import { defineConfig, devices } from '@playwright/test'

import { LOCAL_RELAY, RELAY_HEALTH_PORT } from './test/support/local-relay.js'

const port = Number(process.env.E2E_PORT ?? 5180)

/**
 * A second server, serving the *built* site.
 *
 * The offline spec needs it and nothing else does. On the dev server the app is
 * dozens of unbundled modules fetched one by one, so a worker that precached
 * "the app" would be precaching a list that does not exist in the thing we
 * publish - and the first offline reload would fail on three modules nobody
 * had asked for yet. The build is one hashed bundle, which is what the worker
 * is written against and what gets deployed.
 */
const previewPort = Number(process.env.E2E_PREVIEW_PORT ?? 5181)

export const PREVIEW_URL = `http://127.0.0.1:${previewPort}`

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  webServer: [
    {
      // `--host 127.0.0.1` on purpose: vite otherwise serves on [::1] only, and
      // a driver asking 127.0.0.1 waits forever on a server that is up. That
      // cost a run during the transport experiment.
      command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
      env: { VITE_RELAY_ADDRESSES: LOCAL_RELAY },
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 60000
    },
    {
      command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
      env: { VITE_RELAY_ADDRESSES: LOCAL_RELAY },
      url: PREVIEW_URL,
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      /**
       * A circuit relay of our own, for the specs that need one to relay.
       *
       * They used to reach a relay on the public internet. That caught real
       * failures a mock never would, and it also let a machine nobody here
       * administers fail every deploy - which it did, on 2026-08-28, over a
       * problem that was not in this code. One smoke spec still calls the
       * public relay and reports; nothing gates on it.
       */
      command: 'node test/support/relay-server.js',
      url: `http://127.0.0.1:${RELAY_HEALTH_PORT}`,
      reuseExistingServer: false,
      timeout: 60000
    }
  ],
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
