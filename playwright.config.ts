import 'dotenv/config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-generated',
  reporter: 'line',
  retries: 0,
  use: {
    baseURL: process.env.TARGET_URL ?? 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
