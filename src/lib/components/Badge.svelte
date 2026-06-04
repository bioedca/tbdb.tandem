<script lang="ts">
  // Badge (PLAN §8.5): confidence high/low · `?` (unknown) · text-inferred `*`.
  // Deliberately CHROME-only colors (neutral + brand) — never a specifier hue —
  // so a flag never reads as a data swatch (§8.2 invariant). Children override
  // the default label text.
  import type { Snippet } from 'svelte'

  let {
    variant,
    title,
    children,
  }: {
    variant: 'high' | 'low' | 'unknown' | 'inferred'
    title?: string
    children?: Snippet
  } = $props()

  // Token-backed chrome only (no specifier hue): a caution amber/orange would
  // collide with MET/THR, so low/unknown stay on the neutral surface tokens.
  const styles = {
    // high confidence — quiet brand affirmation
    high: 'bg-brand-subtle text-brand-strong border-brand/30',
    // low confidence — muted neutral, still readable
    low: 'bg-surface-subtle text-body border-hairline',
    // unknown specifier `?` — neutral grey
    unknown: 'bg-surface-subtle text-muted border-hairline',
    // text-inferred `func_class` — subtle, paired with the `*` marker
    inferred: 'bg-surface text-muted border-hairline',
  } as const

  const defaultLabel = {
    high: 'high',
    low: 'low',
    unknown: '?',
    inferred: 'inferred*',
  } as const

  const defaultTitle = {
    high: 'High-confidence locus',
    low: 'Low-confidence locus',
    unknown: 'Unknown / unresolved specifier',
    inferred: "Function class inferred from the downstream gene's text annotation, not an EC (Enzyme Commission) number",
  } as const
</script>

<span
  class="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-caption font-medium {styles[
    variant
  ]}"
  title={title ?? defaultTitle[variant]}
>
  {#if children}{@render children()}{:else}{defaultLabel[variant]}{/if}
</span>
