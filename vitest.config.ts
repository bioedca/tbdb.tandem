// Vitest config (PLAN §10.2/§10.3, §7.5). Separate from `vite.config.ts` so the
// app build stays lean — the Svelte plugin (reading `svelte.config.js` for
// `vitePreprocess`) compiles components and the `*.svelte.ts` rune modules; the
// jsdom environment + the `browser` resolve condition give component tests a DOM
// and pull Svelte's client build (per the Svelte testing guide). The Tailwind
// plugin is intentionally absent: components use utility classes as plain strings,
// so no CSS processing is needed at test time.
import { defineConfig, configDefaults } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    // The Playwright e2e suite lives under tests/e2e/ and uses @playwright/test —
    // it must NOT be collected by Vitest (it needs a real browser, not jsdom).
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    setupFiles: ['tests/setup.ts'],
  },
  // Use the `browser` entry points even though Vitest runs in Node, so Svelte
  // resolves to its client runtime (Svelte testing guide).
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
})
