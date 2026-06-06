// Component: NoPolarityBanner (PLAN §6, §8.1, §13). The banner is the standing
// no-polarity guardrail mounted on /tree (STEPS S3.2) and a §13 ship gate, so its
// EXACT §6 text is pinned here as a CI invariant — not just a one-time manual
// browser check. `NO_POLARITY_BANNER_TEXT` is the single source of truth the
// component renders, so asserting against it locks the rendered copy to the spec.
import { render } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'

import NoPolarityBanner, {
  NO_POLARITY_BANNER_TEXT,
} from '../../src/lib/components/NoPolarityBanner.svelte'

describe('NoPolarityBanner', () => {
  test('renders the exact PLAN §6 no-polarity text', () => {
    const { getByText } = render(NoPolarityBanner)
    expect(getByText(NO_POLARITY_BANNER_TEXT)).toBeInTheDocument()
  })

  test('the banner text is byte-for-byte the locked §6 string', () => {
    // Drift guard: if PLAN §6 ever changes, this string (and the component) must be
    // updated deliberately. No "ancestral/redeployed/abandoned/gained/lost" language.
    expect(NO_POLARITY_BANNER_TEXT).toBe(
      'Exploratory similarity map, unrooted; branch positions reflect sequence similarity, not ancestry.',
    )
  })

  test('is a low-chrome note, not an alert (PLAN §8.5)', () => {
    const { getByRole } = render(NoPolarityBanner)
    // role="note" — informational, never an alert/aria-live region.
    expect(getByRole('note')).toBeInTheDocument()
  })
})
