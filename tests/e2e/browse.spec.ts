import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { gotoRoute, shownCount } from './_helpers'

// Browse (PLAN §10.4): the faceted table sorts, filters, searches, and exports CSV.
// The shared cross-filter store is the single filter source (§7.3); Tabulator owns
// column sort + CSV.

test.describe('Browse', () => {
  test('free-text search narrows and clears', async ({ page }) => {
    await gotoRoute(page, '/browse')
    await expect(shownCount(page)).toHaveText('470')

    const search = page.locator('input[type="search"]')
    await search.fill('Ktedonobacter')
    await expect(shownCount(page)).toHaveText('1')

    await search.fill('')
    await expect(shownCount(page)).toHaveText('470')
  })

  test('a facet checkbox filters the table', async ({ page }) => {
    await gotoRoute(page, '/browse')
    await expect(shownCount(page)).toHaveText('470')

    // Open the Specifier disclosure and tick TRP (139 loci; matches summary.json).
    await page.locator('summary:has-text("Specifier")').click()
    const specMenu = page.getByRole('group', { name: 'Specifier filter' })
    await specMenu.getByText('TRP', { exact: true }).click()
    await expect(shownCount(page)).toHaveText('139')

    // Untick → back to the full set.
    await specMenu.getByText('TRP', { exact: true }).click()
    await expect(shownCount(page)).toHaveText('470')
  })

  test('column sort reorders the rows', async ({ page }) => {
    await gotoRoute(page, '/browse')
    await expect(shownCount(page)).toHaveText('470')

    const meanHeader = page.locator('.tabulator-col[tabulator-field="mean_pairwise_identity"]')
    const firstMean = page
      .locator('.tabulator-row')
      .first()
      .locator('[tabulator-field="mean_pairwise_identity"]')

    await meanHeader.click() // ascending
    const asc = (await firstMean.textContent())?.trim()
    await meanHeader.click() // descending
    await expect
      .poll(async () => (await firstMean.textContent())?.trim())
      .not.toBe(asc)
  })

  test('CSV export downloads the current selection', async ({ page }) => {
    await gotoRoute(page, '/browse')
    await expect(shownCount(page)).toHaveText('470')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('tbdb-tandem-loci.csv')

    // The CSV must carry the current selection — header + 470 data rows — not be
    // empty/stale (content-vs-selection is also covered by the §10.3 component test).
    const csv = readFileSync((await download.path())!, 'utf8')
    const lines = csv.trim().split('\n')
    expect(lines.length).toBe(471)
    expect(csv).toContain('T0001')
  })
})
