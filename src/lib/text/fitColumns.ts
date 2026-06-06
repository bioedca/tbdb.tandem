// Reflow-free table-header auto-fit (responsive scaling — §4.1 critique fix).
//
// Tabulator owns its own header DOM, so its column labels never passed through the
// pretext measurement layer the rest of the app uses — which is why "Elements" and
// "Spec. agreement" clipped to their short DATA widths. This pure helper sizes each
// column to its header LABEL using `naturalWidthPx` (canvas measurement, no reflow),
// so a header can never clip while short-label columns stay tight. Kept framework-free
// here so the no-clip invariant is unit-testable without a real browser/Tabulator.
import { naturalWidthPx } from './measure'

/** Default per-column minimum when a column declares none (matches the table's
 *  `columnDefaults.minWidth`). */
export const DEFAULT_MIN_WIDTH = 96

/** The Tabulator column fields this helper reads/patches — kept structural (not the
 *  full ColumnDefinition) so the helper stays dependency-free and testable. */
export interface FittableColumn {
  title?: string
  width?: number | string
  minWidth?: number
}

/**
 * Return patched COPIES of `columns` widened so each header label can never clip:
 * `minWidth` (and `width`, only where the column carries an explicit NUMERIC one) grow
 * to fit the measured label width + `chrome` (header cell padding + the sort-arrow glyph).
 *
 * Invariants: pure (never mutates the input); only ever WIDENS (a column already roomier
 * than its label is untouched); a column WITHOUT an explicit numeric width keeps it unset,
 * so a `widthGrow` flex column's fill is preserved. `font` must be a NAMED family + weight
 * matching the real header CSS (pretext caveat). Reflow-free; off-canvas (jsdom/SSR) it
 * uses the same glyph-estimate fallback as every other `measure.ts` caller.
 */
export function fitColumnHeaders<T extends FittableColumn>(
  columns: readonly T[],
  font: string,
  chrome: number,
): T[] {
  return columns.map((col) => {
    const need = Math.ceil(naturalWidthPx(String(col.title ?? ''), font)) + chrome
    const next = { ...col }
    next.minWidth = Math.max(col.minWidth ?? DEFAULT_MIN_WIDTH, need)
    if (typeof col.width === 'number') next.width = Math.max(col.width, need)
    return next
  })
}
