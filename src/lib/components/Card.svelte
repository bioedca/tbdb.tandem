<script lang="ts">
  // Card / panel — the single surface treatment (PLAN §8.4): consistent radius,
  // hairline border, restrained shadow. Used for KPI tiles, viz panels, detail
  // blocks. Optional title/subtitle header and a top-right `actions` snippet.
  import type { Snippet } from 'svelte'

  let {
    title,
    subtitle,
    actions,
    children,
    class: klass = '',
  }: {
    title?: string
    subtitle?: string
    actions?: Snippet
    children?: Snippet
    class?: string
  } = $props()
</script>

<section
  class="rounded-panel border border-hairline bg-surface shadow-sm {klass}"
>
  {#if title || subtitle || actions}
    <header class="flex items-start justify-between gap-4 border-b border-hairline px-5 py-3">
      <div>
        {#if title}<h2 class="text-h2 text-ink">{title}</h2>{/if}
        {#if subtitle}<p class="text-small text-muted">{subtitle}</p>{/if}
      </div>
      {#if actions}<div class="shrink-0">{@render actions()}</div>{/if}
    </header>
  {/if}
  <div class="px-5 py-4">
    {@render children?.()}
  </div>
</section>
