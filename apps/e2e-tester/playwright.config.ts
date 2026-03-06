import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, '..', 'desktop');

/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  r3ditor E2E Tester — Playwright Configuration            ║
 * ║                                                           ║
 * ║  Starts the r3ditor Vite dev server in parallel, then     ║
 * ║  runs Playwright tests against it in a real browser.      ║
 * ╚═══════════════════════════════════════════════════════════╝
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,       // Sequential — we simulate a single user session
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 120_000,           // 2 min per test — CAD ops can be slow
  expect: {
    timeout: 15_000,
  },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
        launchOptions: {
          args: ['--enable-webgl', '--use-gl=angle'],
        },
      },
    },
  ],

  /* Start the Vite dev server before running tests */
  webServer: {
    command: 'npx vite --host',
    cwd: DESKTOP_DIR,
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
