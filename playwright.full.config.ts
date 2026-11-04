import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['json', { outputFile: 'test-results/e2e.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:18080',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    headless: true,
  },
  webServer: {
    command: 'node scripts/build-isolated.mjs --serve-test',
    url: 'http://127.0.0.1:18080/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
