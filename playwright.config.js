import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 5180)

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  webServer: {
    // `--host 127.0.0.1` on purpose: vite otherwise serves on [::1] only, and a
    // driver asking 127.0.0.1 waits forever on a server that is up. That cost a
    // run during the transport experiment.
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60000
  },
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
