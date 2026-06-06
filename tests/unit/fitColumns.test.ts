// Unit: table-header auto-fit (responsive scaling — §4.1 / §6.1 critique fix).
//
// The headline guard the critique asks for: a header label can NEVER end up wider than
// its column box, so a future relabel/retitle can't silently re-introduce a clipped
// header. Under vitest/jsdom there is no canvas, so `naturalWidthPx` runs its glyph-count
// fallback — the [min,max]/no-clip CONTRACT below holds identically on the real canvas
// path (only the per-glyph advance differs). The REAL FacetTable column set is exercised
// end-to-end in tests/component/FacetTable.test.ts.
import { describe, expect, test } from 'vitest'
import { fitColumnHeaders, DEFAULT_MIN_WIDTH } from '../../src/lib/text/fitColumns'
import { naturalWidthPx } from '../../src/lib/text/measure'

const FONT = '600 14px "Inter Variable"'
const CHROME = 42

// Mirrors the SHIPPED FacetTable columns (title + data-driven width). Organism is the
// widthGrow flex column — declared with NO explicit width on purpose.
const COLUMNS = [
  { title: 'Locus', width: 92 },
  { title: 'Organism', minWidth: 180 }, // widthGrow — no `width`
  { title: 'Phylum', width: 132 },
  { title: 'Specifier', width: 132 },
  { title: 'Elements', width: 92 },
  { title: 'Spec. agreement', width: 132 },
  { title: 'Confidence', width: 116 },
  { title: 'Function', width: 150 },
  { title: 'Mean %id', width: 110 },
  { title: 'Accession', width: 140 },
]

describe('fitColumnHeaders', () => {
  test('no fitted column box is narrower than its header label (the no-clip invariant)', () => {
    const fitted = fitColumnHeaders(COLUMNS, FONT, CHROME)
    for (const col of fitted) {
      const labelPx = naturalWidthPx(col.title!, FONT)
      // The box the header actually gets to use: an explicit width if present, else the
      // min the column will hold. Either way the label + its chrome must fit inside.
      const box = (typeof col.width === 'number' ? col.width : col.minWidth!) - CHROME
      expect(box, `"${col.title}" inner box ≥ label`).toBeGreaterThanOrEqual(labelPx)
    }
  })

  test('only ever WIDENS — a roomy short-label column keeps its width', () => {
    // "Accession" (140px) is far wider than its 9-char label + chrome, so it is untouched.
    const fitted = fitColumnHeaders(COLUMNS, FONT, CHROME)
    const accession = fitted.find((c) => c.title === 'Accession')!
    expect(accession.width).toBe(140)
  })

  test('preserves a widthGrow column (no explicit width is ever assigned)', () => {
    const fitted = fitColumnHeaders(COLUMNS, FONT, CHROME)
    const organism = fitted.find((c) => c.title === 'Organism')!
    expect(organism.width).toBeUndefined()
    // …but its minWidth still grows to fit the label so it can't clip when narrow.
    expect(organism.minWidth!).toBeGreaterThanOrEqual(naturalWidthPx('Organism', FONT))
  })

  test('does not mutate the input columns', () => {
    const input = [{ title: 'Elements', width: 92 }]
    fitColumnHeaders(input, FONT, CHROME)
    expect(input[0].width).toBe(92)
  })

  test('a column with no declared minimum falls back to DEFAULT_MIN_WIDTH', () => {
    // A short label whose need < default keeps the default floor.
    const [col] = fitColumnHeaders([{ title: 'X' }], FONT, CHROME)
    expect(col.minWidth).toBe(Math.max(DEFAULT_MIN_WIDTH, Math.ceil(naturalWidthPx('X', FONT)) + CHROME))
  })
})
