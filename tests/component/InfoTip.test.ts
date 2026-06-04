// Component: InfoTip ⓘ affordance (PLAN §8.5 accessibility, §8.1 voice).
// The definition must be reachable by hover, keyboard focus, AND touch (a tap
// focuses the button), and must not be shown until the user asks for it.
import { render, screen, fireEvent } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import InfoTip from '../../src/lib/components/InfoTip.svelte'

describe('InfoTip', () => {
  test('carries the glossary term + definition as its accessible name', () => {
    render(InfoTip, { props: { term: 'locus' } })
    const button = screen.getByRole('button')
    expect(button).toHaveAccessibleName(/^Locus: One genomic window/)
  })

  test('builds the accessible name from an explicit label + tip', () => {
    render(InfoTip, { props: { label: 'View', tip: 'One dot per locus.' } })
    expect(screen.getByRole('button')).toHaveAccessibleName('View: One dot per locus.')
  })

  test('shows no popover until the user interacts', () => {
    render(InfoTip, { props: { term: 'locus' } })
    expect(screen.queryByText(/^One genomic window/)).not.toBeInTheDocument()
  })

  test('reveals the headword + definition on keyboard focus, and hides on blur', async () => {
    render(InfoTip, { props: { term: 'locus' } })
    const button = screen.getByRole('button')

    await fireEvent.focus(button)
    expect(screen.getByText('Locus')).toBeInTheDocument()
    expect(screen.getByText(/^One genomic window/)).toBeInTheDocument()

    await fireEvent.blur(button)
    expect(screen.queryByText(/^One genomic window/)).not.toBeInTheDocument()
  })

  test('reveals the definition on mouse hover, and hides on mouse leave', async () => {
    render(InfoTip, { props: { tip: 'A custom one-liner.' } })
    const button = screen.getByRole('button')

    await fireEvent.mouseEnter(button)
    expect(screen.getByText('A custom one-liner.')).toBeInTheDocument()

    await fireEvent.mouseLeave(button)
    expect(screen.queryByText('A custom one-liner.')).not.toBeInTheDocument()
  })

  test('Escape dismisses the popover without moving focus, and re-hover restores it', async () => {
    render(InfoTip, { props: { term: 'locus' } })
    const button = screen.getByRole('button')

    await fireEvent.focus(button)
    expect(screen.getByText(/^One genomic window/)).toBeInTheDocument()

    // Escape hides it but leaves the trigger focused (WAI-ARIA tooltip pattern).
    await fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByText(/^One genomic window/)).not.toBeInTheDocument()

    // A fresh hover intent clears the dismissal and shows it again.
    await fireEvent.mouseEnter(button)
    expect(screen.getByText(/^One genomic window/)).toBeInTheDocument()
  })

  test('does not duplicate the definition for screen readers (popover is aria-hidden)', async () => {
    const { container } = render(InfoTip, { props: { term: 'locus' } })
    const button = screen.getByRole('button')
    await fireEvent.focus(button)
    const pop = container.querySelector('.tv-infotip-pop')
    expect(pop).toHaveAttribute('aria-hidden', 'true')
  })
})
