import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start:dev -w api',
      cwd: '../..',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'npm run dev -w web',
      cwd: '../..',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
