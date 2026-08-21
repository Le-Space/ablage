import { defineConfig, devices } from '@playwright/test'

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
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 60000
    },
    {
      command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
      url: PREVIEW_URL,
      reuseExistingServer: false,
      timeout: 120000
    }
  ],
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
