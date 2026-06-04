import { test, expect } from '@playwright/test'
import { gotoRoute } from './_helpers'

// About (PLAN §10.4): the method note renders its sections — detection algorithm,
// data caveats, the no-polarity disclaimer, and provenance/citation — with the
// attribution links resolving.

const SECTIONS = [
  'What this is',
  'How the database is built',
  'Reproduce it yourself',
  'Data caveats',
  'The similarity map is not a phylogeny',
  'Provenance & citation',
  'Glossary',
]

test.describe('About (/about)', () => {
  test('renders every method-note section and the attribution links', async ({ page }) => {
    await gotoRoute(page, '/about')

    await expect(page.getByRole('heading', { level: 1, name: 'About & method' })).toBeVisible()
    for (const name of SECTIONS) {
      await expect(page.getByRole('heading', { name })).toBeVisible()
    }

    // No-polarity disclaimer embeds the banner (§6).
    await expect(page.getByRole('note')).toBeVisible()

    // The reproduction script is offered as a download under the Pages base path.
    const download = page.getByRole('link', { name: /Download reproduce_tandem_tbox_db\.py/ })
    await expect(download).toBeVisible()
    await expect(download).toHaveAttribute('download', 'reproduce_tandem_tbox_db.py')
    expect(await download.getAttribute('href')).toContain('reproduce_tandem_tbox_db.py')

    // The three attribution links (§14): TBDB home, the CC-BY DOI, the citing page.
    await expect(page.locator('a[href="https://tbdb.io"]')).toBeVisible()
    await expect(page.locator('a[href="https://doi.org/10.1093/nar/gkaa721"]')).toBeVisible()
    await expect(page.locator('a[href="https://tbdb.io/citing.html"]').first()).toBeVisible()
  })
})
