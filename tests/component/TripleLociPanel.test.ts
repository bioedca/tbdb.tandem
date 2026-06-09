import { render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import TripleLociPanel from '../../src/lib/components/TripleLociPanel.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { resetStore, seedStore } from '../helpers'

beforeEach(seedStore)
afterEach(resetStore)

describe('TripleLociPanel', () => {
  test('surfaces three-element loci outside the specificity chart', () => {
    render(TripleLociPanel)
    expect(screen.getByRole('heading', { name: 'Three-element loci' })).toBeInTheDocument()
    expect(screen.getByText('T0005')).toBeInTheDocument()
    expect(screen.getByText(/of 6 tandem loci carry three T-box elements/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /three-element locus with specifiers TRP, ILE, LEU/ })).toBeInTheDocument()
  })

  test('shows how many three-element loci match the active dashboard filter', () => {
    seedStore()
    store.setFacet('specifier', ['ILE;LEU'])
    render(TripleLociPanel)
    expect(screen.getByText('0 match the current dashboard filter.')).toBeInTheDocument()
  })
})
