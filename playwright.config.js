import { defineConfig, devices } from '@playwright/test';

// BASE_URL set  -> test that running/deployed instance (no local server).
// BASE_URL unset -> Playwright starts the app on port 3100 (Vite embedded, no file watcher).
// DATABASE_URL for tests comes from .env.test (gitignored), never the dev/prod .env.
try { process.loadEnvFile('.env.test'); } catch (e) { if (e.code !== 'ENOENT') throw e; }

const BASE_URL = process.env.BASE_URL;
const PORT = 3100;

export default defineConfig({
  testDir: './tests',
  globalTeardown: './tests/support/global-teardown.js',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'chromium', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL } },
    { name: 'mobile', testDir: './tests/e2e', grep: /@smoke/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: BASE_URL
    ? undefined
    : {
        command: 'node server/index.js --dev',
        url: `http://localhost:${PORT}/api/health`,
        // Explicit env beats .env (loadEnvFile never overrides). Telemetry off for tests.
        env: {
          PORT: String(PORT),
          ...(process.env.DATABASE_URL && { DATABASE_URL: process.env.DATABASE_URL }),
          OTEL_EXPORTER_OTLP_ENDPOINT: '',
          BETTER_AUTH_URL: `http://localhost:${PORT}`,
        },
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
      },
});
