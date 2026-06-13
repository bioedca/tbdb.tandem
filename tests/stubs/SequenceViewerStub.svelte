<script lang="ts">
  // Test stub for the published @molbiohive/hatchlings SequenceViewer — renders a sentinel only,
  // so component tests can assert it mounted with the right member's data without the real
  // SVG sequence grid (and without coupling to the library's internals). It also surfaces the
  // fill-width zoom wiring (charsPerRow / charWidth) and the per-zoom ruler visibility (showNumbers)
  // so the bases-per-row model and the low-zoom number thinning can be asserted.
  let {
    data,
    charsPerRow,
    charWidth,
    showNumbers,
  }: {
    data?: { seq?: string; parts?: unknown[] }
    charsPerRow?: number
    charWidth?: number
    showNumbers?: boolean
  } = $props()
</script>

<div
  data-seqviewer
  data-seqlen={data?.seq?.length ?? 0}
  data-partcount={data?.parts?.length ?? 0}
  data-charsperrow={charsPerRow ?? ''}
  data-charwidth={charWidth ?? ''}
  data-shownumbers={showNumbers}
></div>
