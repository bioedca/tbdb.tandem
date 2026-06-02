// Global Vitest setup (PLAN §10.3). Registers the jest-dom matchers
// (`toBeInTheDocument`, `toHaveAttribute`, …) on Vitest's `expect` and unmounts
// any rendered Svelte component after every test so jsdom starts each test clean.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/svelte'

afterEach(() => {
  cleanup()
})
