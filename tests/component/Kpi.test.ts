// Component: Kpi tile (PLAN §10.3, §8.5). Label + value + optional hint.
import { render, screen } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import Kpi from '../../src/lib/components/Kpi.svelte'

describe('Kpi', () => {
  test('renders label, value, and hint', () => {
    render(Kpi, { props: { label: 'Loci', value: 470, hint: 'tandem T-box loci' } })
    expect(screen.getByText('Loci')).toBeInTheDocument()
    expect(screen.getByText('470')).toBeInTheDocument()
    expect(screen.getByText('tandem T-box loci')).toBeInTheDocument()
  })

  test('omits the hint when not given', () => {
    render(Kpi, { props: { label: 'Members', value: 949 } })
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('949')).toBeInTheDocument()
    expect(screen.queryByText('canonical cores')).not.toBeInTheDocument()
  })

  test('accepts a string value', () => {
    render(Kpi, { props: { label: 'Mean %id', value: '80.0' } })
    expect(screen.getByText('80.0')).toBeInTheDocument()
  })
})
