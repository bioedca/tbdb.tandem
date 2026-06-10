import { test, expect } from '@playwright/test'
import { gotoRoute } from './_helpers'

// Visual regression (PLAN §10.5): pixel-snapshot the DETERMINISTIC surfaces only —
// the dashboard chrome/layout, the architecture diagram (deterministic SVG), the
// tree (fixed FastTree seed + fixed equal-angle layout), and the KPI strip.
// EXCLUDED: the force-directed fornac RNA (non-deterministic — asserted by
// presence/fallback in locus.spec.ts, not pixels); Plotly chart internals are
// masked here and asserted via DOM/cross-filter checks elsewhere. Baselines are
// generated + compared in the CI Linux container with the self-hosted fonts; a
// small maxDiffPixelRatio (playwright.config.ts) absorbs sub-pixel AA noise.

async function fontsReady(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

test.describe('Visual regression', () => {
  test('KPI strip', async ({ page }) => {
    await gotoRoute(page, '/')
    const kpi = page.locator('div.lg\\:grid-cols-6').first()
    await expect(kpi).toBeVisible()
    await expect(kpi.getByText('470')).toBeVisible() // values populated
    await fontsReady(page)
    // Each KPI value is `use:fitText`-sized once fonts settle; await all six `data-fitted`
    // signals so the snapshot captures the final sizes, never a mid-fit frame.
    await expect(kpi.locator('[data-fitted]')).toHaveCount(6)
    await expect(kpi).toHaveScreenshot('kpi-strip.png')
  })

  test('architecture diagram (T0342)', async ({ page }) => {
    await gotoRoute(page, '/locus/T0342')
    const arch = page.locator('figure.tv-arch')
    // The main diagram svg carries role="img"; the legend glyph svgs are aria-hidden.
    await expect(arch.locator('svg[role="img"]')).toBeVisible({ timeout: 30_000 })
    // T0342 resolves trpE → the downstream gene draws TO SCALE once the NCBI context loads. Wait for
    // that settled state (not the first schematic frame) so the pixel baseline is deterministic.
    await expect(arch).toHaveAttribute('data-arch-scale', 'to-scale', { timeout: 30_000 })
    await fontsReady(page)
    await expect(arch).toHaveScreenshot('architecture-T0342.png')
  })

  test('similarity tree (main, locus-collapse)', async ({ page }) => {
    await gotoRoute(page, '/tree')
    const tips = page.locator('.tv-phylotree circle.tv-tip')
    await expect(tips.first()).toBeVisible({ timeout: 30_000 })
    // Let the (deterministic) equal-angle layout settle to its full tip set.
    await expect.poll(async () => tips.count(), { timeout: 30_000 }).toBeGreaterThan(100)
    await fontsReady(page)
    await expect(page.locator('.tv-phylotree')).toHaveScreenshot('tree-main.png')
  })

  test('dashboard chrome/layout (charts + tree masked)', async ({ page }) => {
    await gotoRoute(page, '/')
    // Members ready (three-element panel) and the dashboard tree rendered, so the masked
    // regions are stable (no spinner→svg height shift behind the mask).
    await expect(page.getByRole('heading', { name: 'Three-element loci' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator('.tv-phylotree circle.tv-tip').first()).toBeVisible({
      timeout: 30_000,
    })
    // All five Plotly panels (spec bar + matrix, spec×phylum, operon bar + sankey)
    // must have rendered so the mask covers real charts, never a leftover spinner.
    await expect(page.locator('.js-plotly-plot')).toHaveCount(5)
    await fontsReady(page)
    // The PageHeader hero (`use:fitText`) sizes itself with pretext once fonts settle; await its
    // `data-fitted` settle signal so the snapshot captures the final size, never a mid-fit frame.
    // The intro lead + helper hold a static reading measure (no fit), so fonts-ready covers them.
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toHaveAttribute(
      'data-fitted',
      '',
    )
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      mask: [page.locator('.js-plotly-plot'), page.locator('.tv-phylotree')],
    })
  })
})
