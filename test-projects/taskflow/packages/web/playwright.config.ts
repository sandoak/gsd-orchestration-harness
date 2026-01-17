import { defineConfig, devices } from '@playwright/test';

// Support port overrides via environment variables to avoid conflicts
const API_PORT = process.env.API_PORT || '3001';
const WEB_PORT = process.env.WEB_PORT || '3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `PORT=${API_PORT} pnpm --filter @taskflow/api dev`,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
    },
    {
      command: `VITE_API_URL=http://localhost:${API_PORT} PORT=${WEB_PORT} pnpm --filter @taskflow/web dev`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
    },
  ],
});
