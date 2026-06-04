import { defineConfig, devices } from '@playwright/test'

// End-to-end + visual-regression config (PLAN §10.4–§10.6, §11.3).
//
// Runs against the PRODUCTION build served by `vite preview` at the REAL Pages
// base path (`/tbdb.tandem/`), so the suite exercises exactly what ships
// — base-path rebasing, hash routing, the committed JSON/tree artifacts, and the
// dynamically-imported chart bundles. GITHUB_ACTIONS is forced on for the
// webServer so the base path is the deploy base both locally and in CI (it is
// already set on the GitHub runner). The Playwright version is PINNED (package.json
// uses an exact `@playwright/test` version) so the bundled Chromium — and thus the
// rendered pixels — are identical between local generation and the CI runner; the
// visual baselines are generated and compared in the CI Linux container (§10.5).
const BASE = '/tbdb.tandem/'
const PORT = 4173
const ORIGIN = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The webServer is a single preview origin shared by all workers; one worker on
  // CI keeps the visual snapshots deterministic (no cross-test layout contention).
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],

  // Baselines live under tests/e2e/__screenshots__/<spec>/<name>-<project>-<platform>.png
  // (committed; the {platform} suffix makes them CI-Linux-specific, §10.5).
  snapshotPathTemplate: 'tests/e2e/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}',

  expect: {
    // A small ratio absorbs sub-pixel AA noise; the surfaces snapshotted are
    // deterministic (fixed FastTree seed + layout, deterministic SVG, self-hosted
    // fonts). Animations are frozen so transitions never bleed into a snapshot.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },

  use: {
    baseURL: `${ORIGIN}${BASE}`,
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce', // honor §8.4 reduced-motion → freeze the cross-filter fades
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Build at the deploy base, then preview it. `--strictPort` fails fast rather
  // than silently picking another port (which would desync baseURL).
  webServer: {
    command: `GITHUB_ACTIONS=true npm run build && GITHUB_ACTIONS=true npm run preview -- --port ${PORT} --strictPort`,
    url: `${ORIGIN}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
