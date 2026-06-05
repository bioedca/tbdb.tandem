// Component: RnaStructure R2DT path (PLAN §9). With a committed R2DT diagram
// available for the element (manifest + per-member fetch mocked), the viewer
// defaults to R2DT, fetches the diagram, and renders the colored canonical-template
// SVG — exercising the fornac⇄R2DT toggle wiring end to end. Kept in its own file so
// the fetch stub + the lib/r2dt module caches stay isolated (Vitest isolates files).
import { render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import RnaStructure from '../../src/lib/components/RnaStructure.svelte'
import { makeMember } from '../fixtures'

const SEQ = 'ACGUACGUAC' // 10 nt
const N = SEQ.length
const manifest = { count: 1, diagrams: { 'T0001.m1': { template: 'T-box', source: 'Rfam' } } }
const diagram = {
  seq: SEQ,
  x: Array.from({ length: N }, (_, i) => i * 12),
  y: Array.from({ length: N }, () => 0),
  pairs: [[1, N]],
  template: 'T-box',
  source: 'Rfam',
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('r2dt/manifest.json')) return jsonResponse(manifest)
      if (u.endsWith('r2dt/T0001.m1.json')) return jsonResponse(diagram)
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const member = makeMember({
  member_id: 'T0001.m1',
  tandem_id: 'T0001',
  unique_name: 'ABCDEF',
  fasta_sequence: SEQ.replace(/U/g, 'T'),
  stems: [{ key: 'i', start: 1, end: 5 }],
  specifier: { aa: 'TRP', codon: 'UGG' },
})

describe('RnaStructure (R2DT)', () => {
  test('defaults to R2DT when a diagram exists and renders the colored canonical layout', async () => {
    render(RnaStructure, { props: { members: [member] } })
    const svg = await screen.findByRole('img', { name: /R2DT/ })
    expect(svg).toBeInTheDocument()
    // one nucleotide circle per residue (scoped to the R2DT svg, not chrome icons)
    expect(svg.querySelectorAll('circle')).toHaveLength(N)
    // the canonical-template caption (not the fornac one)
    expect(screen.getByText(/T-box template \(RF00230\) · R2DT/)).toBeInTheDocument()
    // the VARNA deep-link is still offered regardless of viewer
    expect(screen.getByRole('link', { name: /VARNA structure on tbdb\.io/ })).toBeInTheDocument()
  })

  test('R2DT pinned on an element with no diagram shows the unavailable copy, not the fornac caption', async () => {
    // A member absent from the manifest (the dominant state until bulk generation).
    const noDiagram = makeMember({
      member_id: 'T0009.m1',
      tandem_id: 'T0009',
      unique_name: 'ZZZZ',
      fasta_sequence: 'ACGTACGT',
      stems: [],
      specifier: { aa: 'TRP', codon: 'UGG' },
    })
    render(RnaStructure, { props: { members: [noDiagram] } })
    // default view is fornac (no diagram) → pin R2DT explicitly
    const r2dtBtn = await screen.findByRole('button', { name: 'R2DT' })
    r2dtBtn.click()
    await screen.findByText(/No R2DT diagram is available for this element/) // the box message
    // the caption must NOT describe a fornac render that isn't on screen
    expect(screen.queryByText(/fornac force layout/)).toBeNull()
    expect(screen.queryByText(/base pairs/)).toBeNull()
  })

  test('the Fornac toggle switches away from the R2DT diagram', async () => {
    const { container } = render(RnaStructure, { props: { members: [member] } })
    await screen.findByRole('img', { name: /R2DT/ }) // R2DT shown first
    await Promise.resolve()
    const fornacBtn = screen.getByRole('button', { name: 'Fornac' })
    fornacBtn.click()
    // fornac can't mount in jsdom (its classic <script> never runs) → the R2DT SVG
    // is gone and the fornac fallback copy + deep-link are shown instead.
    await vi.waitFor(() => {
      expect(container.querySelector('svg[aria-label*="R2DT"]')).toBeNull()
    })
  })
})
