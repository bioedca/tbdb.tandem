<script lang="ts">
  // Test stub for the published @molbiohive/hatchlings ZoomControls (a row of +/−/reset buttons).
  let { zoom }: { zoom?: number; minZoom?: number; maxZoom?: number; step?: number; onzoomchange?: (z: number) => void } = $props()
</script>

<div data-zoomcontrols data-zoom={zoom}></div>
