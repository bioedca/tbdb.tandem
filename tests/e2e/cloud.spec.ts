import { test, expect } from '@playwright/test'
import { gotoRoute } from './_helpers'

// Cloud (/cloud, PLAN /cloud §9): the lazy 3D similarity cloud renders, carries the
// no-polarity guardrail + the honest variance readout, and its controls work. WebGL
// pixels are NOT asserted (software GL varies by runner) — we check the DOM HUD +
// readouts, and tolerate a graceful fallback when WebGL is unavailable.

test.describe('Cloud (/cloud)', () => {
  test('is reachable from the nav and renders the no-polarity + variance readouts', async ({
    page,
  }) => {
    await gotoRoute(page, '/')
    await page.getByRole('link', { name: '3D cloud' }).click()
    await expect(page).toHaveURL(/#\/cloud$/)

    // No-polarity banner (the ship-gate invariant; §6/§8.1).
    const banner = page.getByRole('note')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('unrooted')
    await expect(banner).toContainText('not ancestry')

    // Honest variance readout: 3 PCoA axes capture 41% of pairwise distance (2D: 32%).
    await expect(page.getByText(/PCoA axes capture/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/41%/)).toBeVisible()
    await expect(page.getByText(/32%/)).toBeVisible()

    // The viewer either mounts a WebGL canvas, or shows the graceful text fallback.
    const canvas = page.locator('canvas')
    const fallback = page.getByText(/WebGL unavailable|could not be loaded/i)
    await expect(canvas.or(fallback).first()).toBeVisible({ timeout: 30_000 })
  })

  test('the HUD controls are present and the tree toggle re-reads the variance', async ({
    page,
  }) => {
    await gotoRoute(page, '/cloud')

    // `exact: true` — Playwright's substring name-match would otherwise also hit the
    // ⓘ InfoTip whose aria-label *contains* "Locus"/"Element".
    await expect(page.getByRole('button', { name: 'Locus', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Element', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Specifier', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset view', exact: true })).toBeVisible()
    await expect(page.locator('#cloud-spread')).toBeVisible()

    // Switch to the fallback (antiterminator) embedding — its variance differs (84% 3D).
    await page.getByRole('button', { name: 'Fallback', exact: true }).click()
    await expect(page.getByText(/84%/)).toBeVisible()
    await expect(page.getByText(/75%/)).toBeVisible()
  })

  test('the spread slider surfaces the honest "inflated for clarity" caveat', async ({ page }) => {
    await gotoRoute(page, '/cloud')
    await expect(page.getByText(/PCoA axes capture/)).toBeVisible({ timeout: 30_000 })
    // At spread 0 there is no inflation warning.
    await expect(page.getByText(/inflated for clarity/i)).toHaveCount(0)
    // Drive the slider up; the honest offset caveat appears.
    await page.locator('#cloud-spread').fill('0.6')
    await expect(page.getByText(/inflated for clarity/i)).toBeVisible()
  })
})
