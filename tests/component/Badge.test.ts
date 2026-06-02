// Component: Badge (PLAN §10.3, §8.5) — confidence high/low · `?` · text-inferred.
import { createRawSnippet } from 'svelte'
import { render, screen } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import Badge from '../../src/lib/components/Badge.svelte'

describe('Badge', () => {
  test('default labels per variant', () => {
    render(Badge, { props: { variant: 'high' } })
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  test('low / unknown / inferred default labels', () => {
    const { unmount: u1 } = render(Badge, { props: { variant: 'low' } })
    expect(screen.getByText('low')).toBeInTheDocument()
    u1()
    const { unmount: u2 } = render(Badge, { props: { variant: 'unknown' } })
    expect(screen.getByText('?')).toBeInTheDocument()
    u2()
    render(Badge, { props: { variant: 'inferred' } })
    expect(screen.getByText('inferred*')).toBeInTheDocument()
  })

  test('the default title describes the variant', () => {
    render(Badge, { props: { variant: 'high' } })
    expect(screen.getByText('high')).toHaveAttribute('title', 'High-confidence locus')
  })

  test('an explicit title overrides the default', () => {
    render(Badge, { props: { variant: 'low', title: 'Custom tip' } })
    expect(screen.getByText('low')).toHaveAttribute('title', 'Custom tip')
  })

  test('children override the default label', () => {
    const children = createRawSnippet(() => ({ render: () => '<span>76 low</span>' }))
    render(Badge, { props: { variant: 'low', children } })
    expect(screen.getByText('76 low')).toBeInTheDocument()
    expect(screen.queryByText('low', { exact: true })).not.toBeInTheDocument()
  })
})
