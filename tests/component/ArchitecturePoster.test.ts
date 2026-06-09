import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import ArchitecturePoster from '../../src/lib/components/ArchitecturePoster.svelte'
import { MEMBERS_BY_LOCUS } from '../fixtures'

describe('ArchitecturePoster', () => {
  test('renders a Layer Cake poster with reused element glyph groups and callouts', () => {
    const { container } = render(ArchitecturePoster, {
      props: {
        members: MEMBERS_BY_LOCUS.get('T0002')!,
        strand: '+',
        funcClass: 'biosynthesis',
        funcSource: 'text',
        downstreamGene: 'ilvD',
      },
    })

    expect(container.querySelector('.layercake-container')).toBeTruthy()
    expect(container.querySelector('.tv-arch-poster')).toBeTruthy()
    expect(container.querySelectorAll('.tv-arch-poster-card')).toHaveLength(2)
    expect(container.querySelectorAll('.tv-arch-element')).toHaveLength(2)
    expect(screen.getByText('Coding region')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Element 1: ILE, AUU/ })).toBeInTheDocument()
  })

  test('specifier callouts expose keyboard/click state', async () => {
    render(ArchitecturePoster, {
      props: {
        members: MEMBERS_BY_LOCUS.get('T0002')!,
        strand: '+',
        funcClass: 'biosynthesis',
        funcSource: 'text',
        downstreamGene: 'ilvD',
      },
    })

    const callout = screen.getByRole('button', { name: /Element 1: ILE, AUU/ })
    expect(callout).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(callout)
    expect(callout).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(callout)
    expect(callout).toHaveAttribute('aria-pressed', 'false')
  })
})
