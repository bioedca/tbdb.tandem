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

  test('the diagram is a static, zoom-free overview that fits its container', async ({ page }) => {
    await gotoRoute(page, '/locus/T0342')
    const arch = page.locator('figure.tv-arch')
    const overlay = arch.locator('svg.tv-arch-overlay')
    await expect(overlay).toBeVisible({ timeout: 30_000 })

    // The to-scale overview FIGURE carries no zoom control — the zoomable detail lives in the
    // sequence viewer below it (outside the figure). So the figure has no "Zoom in" affordance, and
    // renders both elements at a stable, container-driven width. (Baseline: architecture-T0342.png.)
    await expect(arch.getByRole('button', { name: 'Zoom in' })).toHaveCount(0)
    await expect(overlay.evaluate((el) => Number(el.getAttribute('width')))).resolves.toBeGreaterThan(0)
    await expect(arch.locator('g.tv-arch-element')).toHaveCount(2)
  })

  test('the sequence zoom fills the frame width (no h-scroll) and grows only vertically', async ({ page }) => {
    await gotoRoute(page, '/locus/T0342')
    // Once the NCBI context loads, the sequence viewer shows the whole locus + carries the zoom.
    await expect(page.getByText('Full locus sequence', { exact: false })).toBeVisible({ timeout: 30_000 })
    const seqSvg = page.locator('.tv-hatch .hatch-sequence-svg')
    await expect(seqSvg).toBeVisible({ timeout: 30_000 })
    const frame = page.locator('.tv-hatch .tv-seqzoom')

    // Zoom is BASES PER ROW: the viewer wraps at exactly `n` bases (so the SVG *width attribute* =
    // svgWidth(n) CHANGES with zoom), then CSS-`zoom` scales it to fill the frame, so the *rendered*
    // row width stays ≈ the frame width at every zoom and the frame never scrolls horizontally.
    const widthAttr = () => seqSvg.evaluate((el) => Number(el.getAttribute('width')))
    const renderedW = () => seqSvg.evaluate((el) => Math.round(el.getBoundingClientRect().width))
    const box = () =>
      frame.evaluate((el) => ({
        clientW: el.clientWidth,
        scrollW: el.scrollWidth,
        clientH: el.clientHeight,
        scrollH: el.scrollHeight,
      }))

    const slider = page.getByRole('slider', { name: 'Sequence zoom' })
    await expect(slider).toBeVisible()

    // Default (mid-level): the row fills the frame width and there is no horizontal scroll.
    const attrDefault = await widthAttr()
    const b0 = await box()
    expect(attrDefault).toBeGreaterThan(0)
    expect(Math.abs((await renderedW()) - b0.clientW)).toBeLessThanOrEqual(3)
    expect(b0.scrollW).toBeLessThanOrEqual(b0.clientW + 1)

    // Max zoom (End → 20 bp/row): fewer bases per row ⇒ the width attribute SHRINKS, the rendered row
    // still fills the frame (no h-overflow), and the content grows taller (vertical scroll).
    await slider.focus()
    await slider.press('End')
    await expect.poll(widthAttr).toBeLessThan(attrDefault)
    const bIn = await box()
    expect(Math.abs((await renderedW()) - bIn.clientW)).toBeLessThanOrEqual(3)
    expect(bIn.scrollW).toBeLessThanOrEqual(bIn.clientW + 1)
    expect(bIn.scrollH).toBeGreaterThan(b0.scrollH)

    // Min zoom (Home → fit-whole): more bases per row ⇒ the width attribute GROWS past the default,
    // the row still fills the frame, and the whole locus fits the window (no meaningful vertical scroll).
    await slider.press('Home')
    await expect.poll(widthAttr).toBeGreaterThan(attrDefault)
    const bOut = await box()
    expect(Math.abs((await renderedW()) - bOut.clientW)).toBeLessThanOrEqual(3)
    expect(bOut.scrollW).toBeLessThanOrEqual(bOut.clientW + 1)
    expect(bOut.scrollH).toBeLessThanOrEqual(bOut.clientH + 8)
  })

  test('per-base numbers drop at min zoom but the specifier tags stay', async ({ page }) => {
    await gotoRoute(page, '/locus/T0342')
    await expect(page.getByText('Full locus sequence', { exact: false })).toBeVisible({ timeout: 30_000 })
    const frame = page.locator('.tv-hatch .tv-seqzoom')
    await expect(frame).toBeVisible({ timeout: 30_000 })
    const slider = page.getByRole('slider', { name: 'Sequence zoom' })
    // The specifier element tags are annotation parts on the track → present at every zoom.
    const tag = page.locator('.tv-hatch .hatch-sequence-svg').getByText(/\(1\)/).first()

    // Max zoom (End → 20 bp/row, large text): the position ruler is shown.
    await slider.focus()
    await slider.press('End')
    await expect(frame).toHaveAttribute('data-seq-numbers', 'true')
    await expect(tag).toBeVisible()

    // Min zoom (Home → fit-whole, tiny text): the ruler is dropped, but the tags remain.
    await slider.press('Home')
    await expect(frame).toHaveAttribute('data-seq-numbers', 'false')
    await expect(tag).toBeVisible()
  })
})
