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
    titleClass = 'text-h2',
  }: {
    title?: string
    subtitle?: string
    actions?: Snippet
    children?: Snippet
    class?: string
    /** Heading size class — defaults to the fixed `text-h2`; pass `text-card-title`
     *  (fluid) on surfaces whose body scales up so the heading stays above it. */
    titleClass?: string
  } = $props()
</script>

<section
  class="rounded-panel border border-hairline bg-surface shadow-sm {klass}"
>
  {#if title || subtitle || actions}
    <header class="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3 sm:px-5">
      <div>
        {#if title}<h2 class="{titleClass} text-ink">{title}</h2>{/if}
        <!-- Cap the subtitle at the shared reading measure so long explanatory lines
             wrap to a comfortable length instead of running the full panel width. -->
        {#if subtitle}<p class="max-w-measure text-small text-muted">{subtitle}</p>{/if}
      </div>
      {#if actions}<div class="shrink-0">{@render actions()}</div>{/if}
    </header>
  {/if}
  <div class="px-4 py-4 sm:px-5">
    {@render children?.()}
  </div>
</section>
