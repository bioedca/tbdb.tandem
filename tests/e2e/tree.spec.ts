import { test, expect } from '@playwright/test'
import { gotoRoute } from './_helpers'

// Tree (PLAN §10.4): the similarity map renders, the fallback toggle switches
// trees, and the no-polarity banner is present. The committed artifacts give a
// deterministic locus-collapse default of 779 tips (main) / 101 tips (fallback)
// after visualization-only annotation-artifact exclusions.

test.describe('Tree (/tree)', () => {
  test('renders the no-polarity banner and toggles main ↔ fallback', async ({ page }) => {
    await gotoRoute(page, '/tree')

    // No-polarity banner (the ship-gate invariant; §6/§8.1) — a low-chrome note.
    const banner = page.getByRole('note')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('unrooted')
    await expect(banner).toContainText('not ancestry')

    // Locus-collapse is the default view; 779 rendered tips of the main Stem-I tree.
    await expect(page.getByText('(loci, main)')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('779 tips')).toBeVisible()

    // The fallback toggle switches to the separate antiterminator tree (101 rendered tips).
    await page.getByRole('button', { name: /^Fallback/ }).click()
    await expect(page.getByText('(loci, fallback)')).toBeVisible()
    await expect(page.getByText('101 tips')).toBeVisible()
    await expect(page.getByText('(loci, main)')).toHaveCount(0)
  })
})
