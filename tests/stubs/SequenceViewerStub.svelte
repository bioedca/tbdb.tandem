<script lang="ts">
  // Test stub for the published @molbiohive/hatchlings SequenceViewer — renders a sentinel only,
  // so component tests can assert it mounted with the right member's data without the real
  // SVG sequence grid (and without coupling to the library's internals).
  let { data }: { data?: { seq?: string; parts?: unknown[] } } = $props()
</script>

<div data-seqviewer data-seqlen={data?.seq?.length ?? 0} data-partcount={data?.parts?.length ?? 0}></div>
