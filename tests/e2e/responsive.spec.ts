import { test, expect, type Page } from '@playwright/test'
import { gotoRoute } from './_helpers'

// Responsive type hierarchy (PLAN §8). The unified ramp must keep its ORDER intact at every
// width — hero (page title) > h2 (section/card title) > lead (standfirst) — so the layout reads
// the same on a phone and a wide desktop. It must ALSO grow/shrink: the fitText hero re-reads
// the fluid clamp() max as the viewport widens (the grow-back fix: it clears its prior inline px
// each resize) and shrinks back as it narrows. Asserted in a real browser where canvas/pretext
// run; the jsdom unit tests can only exercise the fallback maths.

/** Computed font-size (px) of the first match — the size actually applied after fit/clamp. */
function fontPx(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
}

test.describe('Responsive type hierarchy', () => {
  test('the ramp keeps hero > section-title > lead at phone and desktop widths', async ({
    page,
  }) => {
    // The dashboard carries the full masthead + section ramp in one view.
    for (const width of [380, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await gotoRoute(page, '/')
      // Wait for a section card to render so its h2 exists, then for fonts + the hero fit.
      const sectionTitle = page.locator('section.rounded-panel h2').first()
      await expect(sectionTitle).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toHaveAttribute(
        'data-fitted',
        '',
      )
      await page.evaluate(async () => {
        await document.fonts.ready
      })

      const hero = await fontPx(page, 'section > header h1')
      const title = await fontPx(page, 'section.rounded-panel h2')
      const lead = await fontPx(page, 'section > header p.text-lead')

      // Strict, monotonic order at this width — size alone encodes the hierarchy.
      expect(hero, `hero > section-title @ ${width}px`).toBeGreaterThan(title)
      expect(title, `section-title > lead @ ${width}px`).toBeGreaterThan(lead)
    }
  })

  test('the hero title grows as the viewport widens and shrinks back', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 })
    await gotoRoute(page, '/browse')

    const h1 = page.getByRole('heading', { level: 1, name: 'Browse' })
    await expect(h1).toHaveAttribute('data-fitted', '') // first fit has landed
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    const narrowH1 = await fontPx(page, 'section > header h1')

    // Widen: the hero must re-fit LARGER (fitText re-reads the clamp() max).
    await page.setViewportSize({ width: 1400, height: 900 })
    await expect
      .poll(() => fontPx(page, 'section > header h1'), { timeout: 15_000 })
      .toBeGreaterThan(narrowH1 + 1)
    const wideH1 = await fontPx(page, 'section > header h1')

    // Narrow again: the hero must shrink back (not stay stuck at the wide size).
    await page.setViewportSize({ width: 600, height: 900 })
    await expect
      .poll(() => fontPx(page, 'section > header h1'), { timeout: 15_000 })
      .toBeLessThan(wideH1 - 1)
  })
})
