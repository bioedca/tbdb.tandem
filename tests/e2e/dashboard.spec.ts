import { test, expect, type Page } from '@playwright/test'
import { gotoRoute, summary, clickMatrixCell, readMatrixCell, shownCount } from './_helpers'

// Dashboard (PLAN §10.4): the KPI strip reflects summary.json, and selecting the
// ILE×LEU cell in the symmetric matrix narrows the table + tree + Sankey to the 10
// branched-chain loci (the §9 cross-filter centerpiece — one shared store).

/** The value div of the KPI tile whose caption is exactly `label`. */
function kpiValue(page: Page, label: string) {
  return page
    .locator('div.lg\\:grid-cols-6 > div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('.text-display')
}

test.describe('Dashboard', () => {
  test('KPI strip matches summary.json', async ({ page }) => {
    await gotoRoute(page, '/')
    // The router only mounts once core data is ready, so a visible KPI value is
    // also the ready signal.
    await expect(kpiValue(page, 'Loci')).toHaveText(String(summary.counts.loci))
    await expect(kpiValue(page, 'Members')).toHaveText(String(summary.counts.members))
    await expect(kpiValue(page, 'Intra-locus pairs')).toHaveText(
      String(summary.counts.intra_locus_pairs),
    )
    await expect(kpiValue(page, 'Triples')).toHaveText(String(summary.counts.triples))
    await expect(kpiValue(page, 'Mixed specifier')).toHaveText(
      String(summary.specifier_agreement.mixed),
    )
    await expect(kpiValue(page, 'Non-Firmicutes')).toHaveText(
      String(summary.counts.non_firmicutes),
    )
    // Sanity-pin the load-bearing trio (CLAUDE §2).
    expect([summary.counts.loci, summary.counts.members, summary.counts.intra_locus_pairs]).toEqual(
      [470, 949, 488],
    )
  })

  test('selecting ILE×LEU in the matrix narrows table + tree + Sankey to 10 loci', async ({
    page,
  }) => {
    await gotoRoute(page, '/')
    await expect(shownCount(page)).toHaveText('470')

    // The matrix needs members.json; the three-element panel appears once it's ready,
    // and the matrix Plotly graph is rendered by then.
    await expect(page.getByRole('heading', { name: 'Three-element loci' })).toBeVisible()
    await expect(
      page.locator('div.lg\\:col-span-3:has(h3:has-text("Element-pair matrix")) .js-plotly-plot'),
    ).toBeVisible()

    // The rendered chart actually shows the ILE×LEU = 10 focal cell (so a matrix-
    // data regression fails here, not just a click-wiring one).
    await expect.poll(() => readMatrixCell(page, 'ILE', 'LEU'), { timeout: 15_000 }).toBe(10)

    // Drive the cell's plotly_click. The handler binds inside plotly.react().then(),
    // which can resolve a tick after the graph div appears; re-emit until the store
    // narrows. The guard (only emit while ≠ '10') prevents a toggle-back to 470.
    await expect
      .poll(
        async () => {
          const txt = (await shownCount(page).textContent())?.trim()
          if (txt !== '10') await clickMatrixCell(page, 'ILE', 'LEU', 10)
          return txt
        },
        { timeout: 15_000 },
      )
      .toBe('10')

    // … a Specifier facet chip appears (the folded cell value "ILE;LEU") …
    await expect(page.getByRole('button', { name: 'Remove Specifier filter' })).toBeVisible()
    // … the dashboard tree shows it is cross-filtered (responder; §9 "narrows … tree") …
    await expect(page.getByText('cross-filtered')).toBeVisible()
    // … and the operon panel still has loci (the Sankey responds, not "No loci match").
    await expect(page.getByText('No loci match the current filter.')).toHaveCount(0)
  })

  test('clicking a dashboard tree tip narrows the shared store by specifier', async ({ page }) => {
    // The S3.2-deferred coverage: the dashboard tree is a SELECTOR (selectable=true).
    await gotoRoute(page, '/')
    await expect(shownCount(page)).toHaveText('470')

    // Wait for the phylotree to render its tip circles.
    const tips = page.locator('.tv-phylotree circle.tv-tip')
    await expect(tips.first()).toBeVisible({ timeout: 30_000 })

    await tips.first().click({ force: true })

    // The store narrowed (a tip click sets the specifier facet), so the selection
    // is below the full 470 and a Specifier chip + the cross-filter cue appear.
    await expect(shownCount(page)).not.toHaveText('470')
    await expect(page.getByRole('button', { name: 'Remove Specifier filter' })).toBeVisible()
    await expect(page.getByText('cross-filtered')).toBeVisible()
  })
})
