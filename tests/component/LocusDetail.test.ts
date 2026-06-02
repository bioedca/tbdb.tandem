// Component: LocusDetail (PLAN §10.3, §9). Focus: the tbdb.io / NCBI deep-link
// resolution — every element always shows its NCBI coordinate fallback, and the
// tbdb.io link only when a `unique_name`/`tbdb_url` is present. On real data all
// 949 members have a `unique_name`, so the null branch is covered HERE, not live
// (PROGRESS S1.5).
import { render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import LocusDetail from '../../src/routes/LocusDetail.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { makeLocus, makeMember } from '../fixtures'
import { resetStore } from '../helpers'

const M2_NCBI = 'https://www.ncbi.nlm.nih.gov/nuccore/CP9?report=genbank&from=2&to=3'

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
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('https://tbdb.io/tboxes/GYROCCC.html')
    // exactly one tbdb.io link — m2 has no unique_name.
    expect(hrefs.filter((h) => h?.includes('tbdb.io'))).toHaveLength(1)
  })

  test('every element shows the NCBI coordinate fallback link', () => {
    const { container } = render(LocusDetail, { props: { params: { id: 'TX' } } })
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(M2_NCBI) // the no-unique_name element's resilient path
    expect(hrefs.filter((h) => h?.includes('ncbi.nlm.nih.gov'))).toHaveLength(2)
  })

  test('a dual-link element renders BOTH tbdb.io and its NCBI fallback', () => {
    const { container } = render(LocusDetail, { props: { params: { id: 'TX' } } })
    const deepLinks = [...container.querySelectorAll('a')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h?.includes('tbdb.io') || h?.includes('ncbi.nlm.nih.gov'))
    // m1 → tbdb + NCBI (2), m2 → NCBI only (1) = 3 element deep-links total.
    expect(deepLinks).toHaveLength(3)
  })

  test('an unknown id renders the not-found state', () => {
    const { container } = render(LocusDetail, { props: { params: { id: 'ZZZ' } } })
    expect(container.textContent).toContain('No locus')
    expect(container.textContent).toContain('ZZZ')
  })
})
