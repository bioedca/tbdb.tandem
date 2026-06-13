<script lang="ts">
  // Test stub for the published @molbiohive/hatchlings SequenceViewer — renders a sentinel only,
  // so component tests can assert it mounted with the right member's data without the real
  // SVG sequence grid (and without coupling to the library's internals). It also surfaces the
  // fill-width zoom wiring (charsPerRow / charWidth) so the bases-per-row model can be asserted.
  let {
    data,
    charsPerRow,
    charWidth,
  }: { data?: { seq?: string; parts?: unknown[] }; charsPerRow?: number; charWidth?: number } = $props()
</script>

<div
  data-seqviewer
  data-seqlen={data?.seq?.length ?? 0}
  data-partcount={data?.parts?.length ?? 0}
  data-charsperrow={charsPerRow ?? ''}
  data-charwidth={charWidth ?? ''}
></div>
