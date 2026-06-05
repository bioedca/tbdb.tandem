import { test, expect, type Page } from '@playwright/test'
import { gotoRoute } from './_helpers'

// Responsive text scaling (PLAN §8). The page-banner hero title (`use:fitText`) and the
// intro lead (`use:fitMeasure`) must GROW the font as the viewport widens — not only shrink.
// That hinges on fitText clearing its prior inline px so the fluid CSS `clamp()` max is
// re-read on each resize (the grow-back fix). This asserts the behavior in a real browser,
// where canvas/pretext run — the jsdom unit tests can only exercise the fallback maths.

/** Computed font-size (px) of the first match — the size the actions actually applied. */
function fontPx(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
}

test.describe('Responsive text scaling', () => {
  test('hero title and intro lead grow as the viewport widens, and shrink back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 900 })
    await gotoRoute(page, '/browse')

    const h1 = page.getByRole('heading', { level: 1, name: 'Browse' })
    await expect(h1).toHaveAttribute('data-fitted', '') // first fit has landed
    await page.evaluate(async () => {
      await document.fonts.ready
    })

    const narrowH1 = await fontPx(page, 'section > header h1')
    const narrowLead = await fontPx(page, 'section > header p')

    // Widen: both must re-fit LARGER (fitText re-reads the clamp() max; fitMeasure rescales).
    await page.setViewportSize({ width: 1400, height: 900 })
    await expect
      .poll(() => fontPx(page, 'section > header h1'), { timeout: 15_000 })
      .toBeGreaterThan(narrowH1 + 1)
    await expect
      .poll(() => fontPx(page, 'section > header p'), { timeout: 15_000 })
      .toBeGreaterThan(narrowLead + 1)

    const wideH1 = await fontPx(page, 'section > header h1')

    // Narrow again: the hero must shrink back (not stay stuck at the wide size).
    await page.setViewportSize({ width: 600, height: 900 })
    await expect
      .poll(() => fontPx(page, 'section > header h1'), { timeout: 15_000 })
      .toBeLessThan(wideH1 - 1)
  })
})
