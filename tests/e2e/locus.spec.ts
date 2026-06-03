import { test, expect } from '@playwright/test'
import { gotoRoute } from './_helpers'

// Locus detail (PLAN §10.4): architecture diagram + element-comparison panel + an
// RNA tab, with tbdb.io and NCBI deep-links resolving to the expected URLs.
// T0342 is the golden collapse-recovered pair (GYROCCC/TRP + AWVAOC5/VAL on
// accession CP045927).

const TBDB_M1 = 'https://tbdb.io/tboxes/GYROCCC.html'
const TBDB_M2 = 'https://tbdb.io/tboxes/AWVAOC5.html'
const NCBI_FRAG = 'nuccore/CP045927'

test.describe('LocusDetail (/locus/T0342)', () => {
  test('renders architecture, comparison, deep-links and an RNA tab', async ({ page }) => {
    await gotoRoute(page, '/locus/T0342')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('T0342')

    // Architecture diagram: the SVG renders one group per element (2 for this pair).
    // The main diagram svg carries role="img"; the legend glyph svgs are aria-hidden.
    const arch = page.locator('figure.tv-arch svg[role="img"]')
    await expect(arch).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('figure.tv-arch g.tv-arch-element')).toHaveCount(2)

    // Element-comparison deep-links resolve to the exact tbdb.io + NCBI URLs (§9).
    await expect(page.locator(`a[href="${TBDB_M1}"]`).first()).toBeVisible()
    await expect(page.locator(`a[href="${TBDB_M2}"]`).first()).toBeVisible()
    await expect(page.locator(`a[href*="${NCBI_FRAG}"]`).first()).toBeVisible()

    // RNA secondary structure: one tab per element + the guaranteed VARNA deep-link
    // (fornac's force-directed render itself is excluded from assertions, §10.5).
    await expect(page.locator('.tv-rna')).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(2)
    await expect(
      page.getByRole('link', { name: /VARNA structure on tbdb\.io/ }).first(),
    ).toBeVisible()
  })
})
