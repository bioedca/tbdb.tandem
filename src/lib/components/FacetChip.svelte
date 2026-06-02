<script lang="ts">
  // Removable facet chip (PLAN §8.5) — one active filter in the cross-filter state.
  // Optional `swatch` shows the specifier data color (a labeled data swatch inside
  // a chrome chip is fine). The × is a real <button> for keyboard accessibility.

  let {
    label,
    value,
    swatch,
    onremove,
  }: {
    label: string
    value: string
    /** CSS background (solid or two-tone gradient) for a specifier swatch, optional. */
    swatch?: string
    onremove?: () => void
  } = $props()
</script>

<span
  class="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-surface py-0.5 pl-2 pr-1 text-small text-body"
>
  {#if swatch}
    <span
      class="size-3 shrink-0 rounded-sm ring-1 ring-ink/10"
      style:background={swatch}
      aria-hidden="true"
    ></span>
  {/if}
  <span class="text-muted">{label}:</span>
  <span class="font-medium">{value}</span>
  {#if onremove}
    <button
      type="button"
      class="ml-0.5 grid size-4 place-items-center rounded-sm text-muted transition-colors duration-150 ease-standard hover:bg-surface-subtle hover:text-ink"
      aria-label="Remove {label} filter"
      onclick={onremove}
    >
      <svg viewBox="0 0 14 14" class="size-3" aria-hidden="true">
        <path
          d="M3.5 3.5l7 7M10.5 3.5l-7 7"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          fill="none"
        />
      </svg>
    </button>
  {/if}
</span>
