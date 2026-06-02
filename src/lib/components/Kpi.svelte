<script lang="ts">
  // KPI tile (PLAN §8.5, §9 dashboard strip). A big mono value over a caption
  // label, on the standard card surface. The value is mono so digits align (§8.3).
  let {
    label,
    value,
    hint,
  }: {
    label: string
    value: string | number
    hint?: string
  } = $props()
</script>

<div class="rounded-panel border border-hairline bg-surface px-5 py-4 shadow-sm">
  <div class="text-caption font-medium uppercase tracking-wide text-muted">{label}</div>
  <div class="mt-1 font-mono text-display leading-none text-ink tabular-nums">{value}</div>
  {#if hint}<div class="mt-1 text-small text-muted">{hint}</div>{/if}
</div>
