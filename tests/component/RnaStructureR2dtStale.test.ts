// Regression: switching between two elements that BOTH have an R2DT diagram must
// never paint the previous element's diagram (coords/seq) with the new element's
// stems while the new diagram is still fetching. The fetch effect clears r2dtData
// synchronously on element change, so the stale diagram is replaced by the loading
// state, not a mismatched overlay. Own file so the lib/r2dt module cache (manifest +
// per-member) starts fresh (Vitest isolates files).
import { render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import RnaStructure from '../../src/lib/components/RnaStructure.svelte'
import { makeMember } from '../fixtures'

const manifest = {
  count: 2,
  diagrams: {
    'T0007.m1': { template: 'T-box', source: 'Rfam' },
    'T0007.m2': { template: 'T-box', source: 'Rfam' },
  },
}
const d1 = { seq: 'ACGUACGUAC', x: Array.from({ length: 10 }, (_, i) => i * 12), y: Array(10).fill(0), pairs: [], template: 'T-box', source: 'Rfam' }
const d2 = { seq: 'ACGU', x: [0, 12, 24, 36], y: [0, 0, 0, 0], pairs: [], template: 'T-box', source: 'Rfam' }

let resolveM2: (v: unknown) => void
let m2gate: Promise<unknown>

beforeEach(() => {
  m2gate = new Promise((r) => {
    resolveM2 = r
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('r2dt/manifest.json')) return Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) } as Response)
      if (u.endsWith('r2dt/T0007.m1.json')) return Promise.resolve({ ok: true, json: () => Promise.resolve(d1) } as Response)
      if (u.endsWith('r2dt/T0007.m2.json')) return m2gate.then(() => ({ ok: true, json: () => Promise.resolve(d2) } as Response))
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('RnaStructure (R2DT) stale-diagram guard', () => {
  test('switching elements drops the previous diagram instead of mis-coloring it', async () => {
    const m1 = makeMember({ member_id: 'T0007.m1', tandem_id: 'T0007', ordinal: 1, unique_name: 'AAA', fasta_sequence: 'ACGTACGTAC', stems: [{ key: 'i', start: 1, end: 5 }], specifier: { aa: 'TRP', codon: 'UGG' } })
    const m2 = makeMember({ member_id: 'T0007.m2', tandem_id: 'T0007', ordinal: 2, unique_name: 'BBB', fasta_sequence: 'ACGT', stems: [{ key: 'at', start: 1, end: 3 }], specifier: { aa: 'VAL', codon: 'GUU' } })
    render(RnaStructure, { props: { members: [m1, m2] } })

    // m1 renders (10 nucleotides)
    const svg1 = await screen.findByRole('img', { name: /R2DT/ })
    expect(svg1.querySelectorAll('circle')).toHaveLength(10)

    // switch to the 3′ element tab (m2); its diagram is still gated (pending)
    screen.getAllByRole('tab')[1].click()

    // the stale m1 diagram must be GONE (loading shown), not lingering with 10 circles
    await vi.waitFor(() => {
      expect(document.querySelector('svg[aria-label*="R2DT"]')).toBeNull()
    })

    // now let m2 resolve → its own 4-nucleotide diagram appears
    resolveM2(null)
    await vi.waitFor(() => {
      const svg2 = document.querySelector('svg[aria-label*="R2DT"]')
      expect(svg2?.querySelectorAll('circle')).toHaveLength(4)
    })
  })
})
