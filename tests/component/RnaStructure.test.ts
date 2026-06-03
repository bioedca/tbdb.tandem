// Component: RnaStructure (PLAN §10.3, §9 detail flow, §13). In jsdom the injected
// classic fornac <script> never executes, so `loadFornac` stays pending and the
// component takes its DEFENSIVE fallback: it shows the loading/fallback copy and the
// GUARANTEED tbdb.io VARNA deep-link (per element), with the NCBI record as the
// resilient fallback when a member has no unique_name. That "in-app mount OR clean
// deep-link fallback" is exactly the §10.3 RnaStructure assertion (no mock needed —
// PROGRESS S2.3).
import { render, screen } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import RnaStructure from '../../src/lib/components/RnaStructure.svelte'
import { makeMember } from '../fixtures'

// whole_antiterm_structure length == fasta_sequence length → a renderable model.
const withName = makeMember({
  member_id: 'L.m1', tandem_id: 'L', ordinal: 1, unique_name: 'ABCDEF',
  fasta_sequence: 'ACGTACGT', whole_antiterm_structure: '((....))',
  specifier: { aa: 'TRP', codon: 'UGG' },
})
const noName = makeMember({
  member_id: 'L.m2', tandem_id: 'L', ordinal: 2, unique_name: null,
  fasta_sequence: 'ACGTACGT', whole_antiterm_structure: '((....))',
  specifier: { aa: 'VAL', codon: 'GUU' },
})

describe('RnaStructure', () => {
  test('renders a tab per element and the active element’s VARNA deep-link', () => {
    render(RnaStructure, { props: { members: [withName, noName] } })
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    const link = screen.getByRole('link', { name: /VARNA structure on tbdb\.io/ })
    expect(link).toHaveAttribute('href', 'https://tbdb.io/tboxes/ABCDEF.html')
  })

  test('falls back cleanly to the deep-link with the loading copy + base-pair caption', () => {
    render(RnaStructure, { props: { members: [withName] } })
    // The model is renderable (so NOT the "isn't available" branch) and fornac is
    // pending in jsdom (so NOT the "couldn't load" failed branch) → the loading
    // sub-state, with the guaranteed deep-link offered below it.
    expect(screen.getByText(/Loading the structure viewer/)).toBeInTheDocument()
    expect(screen.queryByText(/couldn’t load|couldn't load/)).toBeNull()
    expect(screen.getByText(/Open the VARNA secondary-structure view on tbdb\.io below/)).toBeInTheDocument()
    expect(screen.getByText(/2 base pairs/)).toBeInTheDocument()
  })

  test('the deep-link falls back to the NCBI record when unique_name is null', () => {
    render(RnaStructure, { props: { members: [noName] } })
    const link = screen.getByRole('link', { name: /NCBI record/ })
    expect(link).toHaveAttribute('href', noName.ncbi_url)
  })
})
