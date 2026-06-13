// Vendored verbatim from @molbiohive/hatchlings@0.8.4 (dist/state/selection.svelte.js),
// re-typed from its sibling .d.ts. See ../ATTRIBUTION.md. The published package's SequenceViewer
// references this class as the `selectionState` prop type; we drive it directly from
// TandemArchitecture so a mouse drag / tag click selects the underlying sequence.

export interface SelectionRange {
  start: number
  end: number
}

/** Synchronized selection state for PlasmidViewer and SequenceViewer. */
export class SelectionState {
  caretPosition = $state(0)
  selectionStart = $state(-1)
  selectionEnd = $state(-1)
  isDragging = $state(false)
  selectedAnnotationIds = $state<string[]>([])
  /** Sequence length (needed for circular wrapping). */
  sequenceLength: number

  constructor(sequenceLength: number) {
    this.sequenceLength = sequenceLength
  }

  /** Selection range preserving drag direction, or null if no selection.
   *  start > end means the selection wraps around origin (circular). */
  get range(): SelectionRange | null {
    if (this.selectionStart < 0 || this.selectionEnd < 0) return null
    if (this.selectionStart === this.selectionEnd) return null
    return { start: this.selectionStart, end: this.selectionEnd }
  }

  /** Whether there is an active selection (not just a caret). */
  get hasSelection(): boolean {
    return this.range !== null
  }

  /** Whether the current selection wraps around origin. */
  get wraps(): boolean {
    const r = this.range
    if (!r) return false
    return r.start > r.end
  }

  /** Length of current selection in bp (handles wrapping). */
  get selectionLength(): number {
    const r = this.range
    if (!r) return 0
    if (r.end >= r.start) return r.end - r.start
    return this.sequenceLength - r.start + r.end
  }

  setCaret(position: number): void {
    this.caretPosition = Math.max(0, Math.min(position, this.sequenceLength))
    this.selectionStart = -1
    this.selectionEnd = -1
  }

  setSelection(start: number, end: number): void {
    this.selectionStart = Math.max(0, Math.min(start, this.sequenceLength))
    this.selectionEnd = Math.max(0, Math.min(end, this.sequenceLength))
    this.caretPosition = this.selectionEnd
  }

  clearSelection(): void {
    this.selectionStart = -1
    this.selectionEnd = -1
  }

  /** Anchor position where the current drag started. */
  dragAnchor = -1

  startDrag(position: number): void {
    this.isDragging = true
    const clamped = Math.max(0, Math.min(position, this.sequenceLength))
    this.dragAnchor = clamped
    this.selectionStart = clamped
    this.selectionEnd = clamped
    this.caretPosition = clamped
  }

  /** Update drag for linear selection (always normalizes to min/max). */
  updateDragLinear(position: number): void {
    if (!this.isDragging) return
    const clamped = Math.max(0, Math.min(position, this.sequenceLength))
    this.selectionStart = Math.min(this.dragAnchor, clamped)
    this.selectionEnd = Math.max(this.dragAnchor, clamped)
    this.caretPosition = clamped
  }

  /** Update drag with explicit start/end (for circular selection with direction tracking). */
  updateDragCircular(start: number, end: number): void {
    if (!this.isDragging) return
    this.selectionStart = Math.max(0, Math.min(start, this.sequenceLength))
    this.selectionEnd = Math.max(0, Math.min(end, this.sequenceLength))
    this.caretPosition = this.selectionEnd
  }

  endDrag(): void {
    this.isDragging = false
    // If start === end, it was just a click — set caret.
    if (this.selectionStart === this.selectionEnd) {
      this.caretPosition = this.selectionStart
      this.selectionStart = -1
      this.selectionEnd = -1
    }
  }

  selectAnnotation(id: string, multi = false): void {
    if (multi) {
      const idx = this.selectedAnnotationIds.indexOf(id)
      if (idx >= 0) {
        this.selectedAnnotationIds = this.selectedAnnotationIds.filter((x) => x !== id)
      } else {
        this.selectedAnnotationIds = [...this.selectedAnnotationIds, id]
      }
    } else {
      this.selectedAnnotationIds = [id]
    }
  }

  selectAll(): void {
    this.setSelection(0, this.sequenceLength)
  }

  /** Move caret by delta bp, optionally extending selection. */
  moveCaret(delta: number, extend = false): void {
    const newPos = Math.max(0, Math.min(this.caretPosition + delta, this.sequenceLength))
    if (extend) {
      if (this.selectionStart < 0) {
        this.selectionStart = this.caretPosition
      }
      this.selectionEnd = newPos
      this.caretPosition = newPos
    } else {
      this.setCaret(newPos)
    }
  }
}
