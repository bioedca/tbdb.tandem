<script lang="ts">
  // Test stub for the vendored @molbiohive/hatchlings SequenceViewer — renders a sentinel only,
  // so component tests can assert it mounted with the right member's data without the real
  // SVG sequence grid (and without coupling to the library's internals). It also surfaces the
  // fill-width zoom wiring (charsPerRow / charWidth), the per-zoom ruler visibility (showNumbers),
  // and whether a selectionState was supplied (the host wires one so a drag / tag click selects
  // the sequence) so the bases-per-row model, low-zoom number thinning, and selection wiring can
  // all be asserted.
  let {
    data,
    charsPerRow,
    charWidth,
    showNumbers,
    selectionState,
  }: {
    data?: { seq?: string; parts?: unknown[] }
    charsPerRow?: number
    charWidth?: number
    showNumbers?: boolean
    selectionState?: unknown
  } = $props()
</script>

<div
  data-seqviewer
  data-seqlen={data?.seq?.length ?? 0}
  data-partcount={data?.parts?.length ?? 0}
  data-charsperrow={charsPerRow ?? ''}
  data-charwidth={charWidth ?? ''}
  data-shownumbers={showNumbers}
  data-has-selection-state={selectionState ? 'true' : 'false'}
></div>
