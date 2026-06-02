// Component: TbdbLink (PLAN §10.3, §8.5, §9) — external-link affordance. The
// "correct URL incl. NCBI fallback" check at the component level: TbdbLink
// faithfully renders whatever resolved href it is handed, tbdb.io OR the NCBI
// coordinate fallback (the URL *construction* + fallback choice is exercised in
// LocusDetail.test.ts).
import { createRawSnippet } from 'svelte'
import { render, screen } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import TbdbLink from '../../src/lib/components/TbdbLink.svelte'

const tbdb = createRawSnippet(() => ({ render: () => '<span>tbdb.io</span>' }))

describe('TbdbLink', () => {
  test('renders an external link with the href, safe rel, and new-tab target', () => {
    render(TbdbLink, { props: { href: 'https://tbdb.io/tboxes/GYROCCC.html', children: tbdb } })
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://tbdb.io/tboxes/GYROCCC.html')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('tbdb.io')).toBeInTheDocument()
    expect(screen.getByText('(opens in a new tab)')).toBeInTheDocument()
  })

  test('renders the NCBI coordinate-fallback URL verbatim', () => {
    const ncbi = createRawSnippet(() => ({ render: () => '<span>NCBI</span>' }))
    const url = 'https://www.ncbi.nlm.nih.gov/nuccore/CP045927?report=genbank&from=1983810&to=1984340'
    render(TbdbLink, { props: { href: url, children: ncbi } })
    expect(screen.getByRole('link')).toHaveAttribute('href', url)
  })

  test('external=false drops target/rel and the new-tab hint', () => {
    render(TbdbLink, { props: { href: '/about', external: false, children: tbdb } })
    const link = screen.getByRole('link')
    expect(link).not.toHaveAttribute('target')
    expect(link).not.toHaveAttribute('rel')
    expect(screen.queryByText('(opens in a new tab)')).not.toBeInTheDocument()
  })

  test('passes a title through', () => {
    render(TbdbLink, { props: { href: 'https://tbdb.io/tboxes/X.html', title: 'tbdb.io entry for X', children: tbdb } })
    expect(screen.getByRole('link')).toHaveAttribute('title', 'tbdb.io entry for X')
  })
})
