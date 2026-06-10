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

    // Architecture diagram: the single deterministic, to-scale SVG renders one group
    // per element (2 for this pair). The main diagram svg carries role="img"; the
    // legend glyph svgs are aria-hidden. (The illustrated Layer Cake alternate and its
    // Accurate/Illustrated view toggle were retired — one figure, no tabs.)
    const arch = page.locator('figure.tv-arch svg[role="img"]')
    await expect(arch).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('figure.tv-arch g.tv-arch-element')).toHaveCount(2)
    await expect(page.getByRole('tab', { name: 'Illustrated' })).toHaveCount(0)

    // Element-comparison deep-links resolve to the exact tbdb.io + NCBI URLs (§9).
    await expect(page.locator(`a[href="${TBDB_M1}"]`).first()).toBeVisible()
    await expect(page.locator(`a[href="${TBDB_M2}"]`).first()).toBeVisible()
    await expect(page.locator(`a[href*="${NCBI_FRAG}"]`).first()).toBeVisible()

    // RNA secondary structure: one tab per element + the guaranteed VARNA deep-link
    // (fornac's force-directed render itself is excluded from assertions, §10.5).
    await expect(page.locator('.tv-rna')).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Elements' }).getByRole('tab')).toHaveCount(2)
    await expect(
      page.getByRole('link', { name: /VARNA structure on tbdb\.io/ }).first(),
    ).toBeVisible()
  })

  test('the conformation toggle switches both viewers between antiterminator and terminator', async ({
    page,
  }) => {
    await gotoRoute(page, '/locus/T0342')
    await expect(page.locator('.tv-rna')).toBeVisible({ timeout: 30_000 })

    const term = page.getByRole('button', { name: 'Terminator', exact: true })
    const antiterm = page.getByRole('button', { name: 'Antiterminator', exact: true })
    await expect(antiterm).toBeVisible()
    await expect(term).toBeEnabled() // T0342 carries a terminator on both elements

    // R2DT antiterminator (the default): the stem + motif color key is shown.
    await expect(page.getByRole('list', { name: 'Stem and motif color key' })).toBeVisible({
      timeout: 30_000,
    })

    // Switch conformation → the terminator key replaces the stem/motif key. The terminator
    // is now FULL-LENGTH, so its key carries the conserved stems (Stem I) AND the terminator
    // stem (the antiterminator helix is unfolded here).
    await term.click()
    const termKey = page.getByRole('list', { name: 'Terminator color key' })
    await expect(termKey).toBeVisible()
    // exact: the caption also echoes these words (case-insensitive substring match otherwise)
    await expect(termKey.getByText('Terminator stem', { exact: true })).toBeVisible()
    await expect(termKey.getByText('Stem I', { exact: true })).toBeVisible() // full-length: stems kept

    // The OTHER viewer also switches: fornac in terminator mode renders its host.
    await page.getByRole('button', { name: 'Fornac', exact: true }).click()
    await expect(
      page.locator('.tv-rna [aria-label="RNA secondary structure"]'),
    ).toBeVisible({ timeout: 30_000 })

    // Back to the antiterminator conformation restores the stem + motif key.
    await antiterm.click()
    await expect(page.getByRole('list', { name: 'Stem and motif color key' })).toBeVisible()
  })

  test('zoom widens the to-scale track while preserving the elements', async ({ page }) => {
    await gotoRoute(page, '/locus/T0342')
    const arch = page.locator('figure.tv-arch')
    const overlay = arch.locator('svg.tv-arch-overlay')
    await expect(overlay).toBeVisible({ timeout: 30_000 })

    const widthOf = () => overlay.evaluate((el) => Number(el.getAttribute('width')))
    const before = await widthOf()
    expect(before).toBeGreaterThan(0)

    // The hatchlings ZoomControls "+" (title="Zoom in") scales the LinearMap + overlay width in
    // lockstep; the figure overflow-scrolls rather than shrinking. The glyph overlay tracks because
    // it shares the strip's bp→x projection. (Non-visual: the deterministic pixel baseline is the
    // default-zoom architecture-T0342.png in visual.spec.ts.)
    await page.locator('button[title="Zoom in"]').click()
    await expect.poll(widthOf).toBeGreaterThan(before)
    await expect(arch.locator('g.tv-arch-element')).toHaveCount(2)
  })
})
