// Component: LocusDetail (PLAN §10.3, §9). Focus: the tbdb.io / NCBI deep-link
// resolution — every element always shows its NCBI coordinate fallback, and the
// tbdb.io link only when a `unique_name`/`tbdb_url` is present. On real data all
// 949 members have a `unique_name`, so the null branch is covered HERE, not live
// (PROGRESS S1.5).
import { render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The Tandem architecture figure (mounted here) composes the vendored LinearMap (renders fine in
// jsdom) with the vendored SequenceViewer — stub the viewer (skips the heavy SVG grid + its rect-
// dependent pointer math) while keeping the real LinearMap + SelectionState, so this route test
// stays focused on the deep-link / identity assertions.
vi.mock('../../src/lib/vendor/hatchlings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/vendor/hatchlings')>()),
  SequenceViewer: (await import('../stubs/SequenceViewerStub.svelte')).default,
}))

import LocusDetail from '../../src/routes/LocusDetail.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { makeLocus, makeMember } from '../fixtures'
import { resetStore } from '../helpers'

// RnaStructure (S2.3) loads fornac by injecting a classic <script> (lib/fornac.ts).
// jsdom doesn't execute injected scripts, so the loader promise just stays pending
// and the component shows its "Loading…" state with the VARNA deep-link — no mock
// needed, and nothing throws. Real fornac mounting is covered by the S3.4 e2e.

const M2_NCBI = 'https://www.ncbi.nlm.nih.gov/nuccore/CP9?report=genbank&from=2&to=3'

/** Deep-link assertions target the Element-comparison table specifically — its
 *  per-element tbdb/NCBI links are this suite's subject. Scoping past the whole
 *  container keeps the counts independent of the RnaStructure VARNA deep-link
 *  (S2.3), which shows the ACTIVE element's link too. */
function comparisonHrefs(container: HTMLElement): (string | null)[] {
  const table = container.querySelector('table')
  if (!table) return []
  return [...table.querySelectorAll('a')].map((a) => a.getAttribute('href'))
}

beforeEach(() => {
  // m1 has a unique_name (→ tbdb link); m2 has none (→ NCBI-only fallback).
  const m1 = makeMember({
    member_id: 'TX.m1', tandem_id: 'TX', ordinal: 1,
    unique_name: 'GYROCCC', specifier: { aa: 'TRP', codon: 'UGG' },
  })
  const m2 = makeMember({
    member_id: 'TX.m2', tandem_id: 'TX', ordinal: 2,
    unique_name: null, specifier: { aa: 'VAL', codon: 'GUU' }, ncbi_url: M2_NCBI,
  })
  const locus = makeLocus({
    tandem_id: 'TX', accession: 'CP9', organism: 'Test organism', phylum: 'Firmicutes',
    specifier_aa: 'TRP', same_specifier: false, n_cores: 2, member_ids: ['TX.m1', 'TX.m2'],
  })
  store.loci = [locus]
  store.membersByLocus = new Map([['TX', [m1, m2]]])
  store.membersStatus = 'ready'
  store.status = 'ready'
  store.reset()
})

afterEach(resetStore)

describe('LocusDetail', () => {
  test('renders the locus identity + element list', () => {
    render(LocusDetail, { props: { params: { id: 'TX' } } })
    expect(screen.getByRole('heading', { name: 'TX' })).toBeInTheDocument()
    expect(screen.getByText('Test organism')).toBeInTheDocument()
  })

  test('element with a unique_name shows its tbdb.io deep-link', () => {
    const { container } = render(LocusDetail, { props: { params: { id: 'TX' } } })
    const hrefs = comparisonHrefs(container)
    expect(hrefs).toContain('https://tbdb.io/tboxes/GYROCCC.html')
    // exactly one tbdb.io link in the comparison — m2 has no unique_name.
    expect(hrefs.filter((h) => h?.includes('tbdb.io'))).toHaveLength(1)
  })

  test('every element shows the NCBI coordinate fallback link', () => {
    const { container } = render(LocusDetail, { props: { params: { id: 'TX' } } })
    const hrefs = comparisonHrefs(container)
    expect(hrefs).toContain(M2_NCBI) // the no-unique_name element's resilient path
    expect(hrefs.filter((h) => h?.includes('ncbi.nlm.nih.gov'))).toHaveLength(2)
  })

  test('a dual-link element renders BOTH tbdb.io and its NCBI fallback', () => {
    const { container } = render(LocusDetail, { props: { params: { id: 'TX' } } })
    const deepLinks = comparisonHrefs(container).filter(
      (h) => h?.includes('tbdb.io') || h?.includes('ncbi.nlm.nih.gov'),
    )
    // m1 → tbdb + NCBI (2), m2 → NCBI only (1) = 3 element deep-links total.
    expect(deepLinks).toHaveLength(3)
  })

  test('renders the single to-scale architecture figure (no view toggle)', () => {
    const { container } = render(LocusDetail, { props: { params: { id: 'TX' } } })
    // The architecture is one deterministic, to-scale figure — the illustrated/Layer
    // Cake alternate and its Accurate/Illustrated tab switch were retired.
    expect(container.querySelector('figure.tv-arch')).toBeTruthy()
    expect(container.querySelector('figure.tv-arch-poster')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Illustrated' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Accurate' })).toBeNull()
  })

  test('an unknown id renders the not-found state', () => {
    const { container } = render(LocusDetail, { props: { params: { id: 'ZZZ' } } })
    expect(container.textContent).toContain('No locus')
    expect(container.textContent).toContain('ZZZ')
  })
})
