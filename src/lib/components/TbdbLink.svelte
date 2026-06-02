<script lang="ts">
  // External-link affordance (PLAN §8.5, §9 tbdb integration). Presentational in
  // S1.2: it renders a brand-accented link with an external-link glyph and safe
  // rel. The tbdb.io / NCBI-fallback URL builders are wired in at S1.5; this
  // component just takes the resolved `href`.
  import type { Snippet } from 'svelte'

  let {
    href,
    external = true,
    title,
    children,
    class: klass = '',
  }: {
    href: string
    external?: boolean
    title?: string
    children?: Snippet
    class?: string
  } = $props()
</script>

<a
  {href}
  {title}
  target={external ? '_blank' : undefined}
  rel={external ? 'noopener noreferrer' : undefined}
  class="inline-flex items-center gap-1 text-brand underline decoration-brand/30 underline-offset-2 transition-colors duration-150 ease-standard hover:text-brand-strong hover:decoration-brand {klass}"
>
  {@render children?.()}
  {#if external}
    <svg viewBox="0 0 16 16" class="size-3.5 shrink-0" aria-hidden="true">
      <path
        d="M6 3.5H4.5A1.5 1.5 0 0 0 3 5v6.5A1.5 1.5 0 0 0 4.5 13H11a1.5 1.5 0 0 0 1.5-1.5V10M9.5 3.5H13V7M13 3.5L7.5 9"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
    </svg>
    <span class="sr-only">(opens in a new tab)</span>
  {/if}
</a>
