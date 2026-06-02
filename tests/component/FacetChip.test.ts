// Component: FacetChip (PLAN §10.3, §8.5) — one removable active filter.
import { render, screen } from '@testing-library/svelte'
import { fireEvent } from '@testing-library/svelte'
import { describe, expect, test, vi } from 'vitest'
import FacetChip from '../../src/lib/components/FacetChip.svelte'

describe('FacetChip', () => {
  test('renders the facet label and value', () => {
    render(FacetChip, { props: { label: 'Specifier', value: 'TRP' } })
    expect(screen.getByText('Specifier:')).toBeInTheDocument()
    expect(screen.getByText('TRP')).toBeInTheDocument()
  })

  test('shows a swatch when given, none otherwise', () => {
    const { container, unmount } = render(FacetChip, {
      props: { label: 'Specifier', value: 'ILE;LEU', swatch: 'linear-gradient(45deg, #4d7c0f 0% 50%, #16a34a 50% 100%)' },
    })
    expect(container.querySelector('[style*="background"]')).not.toBeNull()
    unmount()
    const { container: c2 } = render(FacetChip, { props: { label: 'Phylum', value: 'Firmicutes' } })
    expect(c2.querySelector('[style*="background"]')).toBeNull()
  })

  test('the × button fires onremove and is keyboard-labeled', () => {
    const onremove = vi.fn()
    render(FacetChip, { props: { label: 'Specifier', value: 'TRP', onremove } })
    const button = screen.getByRole('button', { name: 'Remove Specifier filter' })
    fireEvent.click(button)
    expect(onremove).toHaveBeenCalledOnce()
  })

  test('renders no remove button without an onremove handler', () => {
    render(FacetChip, { props: { label: 'Specifier', value: 'TRP' } })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
