<script lang="ts">
  // A small, keyboard-reachable ⓘ affordance that carries a one-line definition
  // (PLAN §8.5 accessibility; §8.1 voice). Used next to chart titles, KPI labels,
  // table headers, and control labels to resolve a term inline without a separate
  // glossary page. CHROME-only (muted/brand) so it never reads as a data swatch
  // (§8.2). The definition is exposed via the native `title` tooltip (hover) AND an
  // `aria-label` (keyboard / screen reader), so the term is discoverable both ways.
  import { def as glossaryDef, term as glossaryTerm, type GlossaryKey } from '../glossary'

  let {
    term: termKey,
    tip,
    label,
  }: {
    /** A glossary key — its headword + definition are used for the accessible name. */
    term?: GlossaryKey
    /** An explicit definition string (overrides `term`'s definition). */
    tip?: string
    /** Optional label prefix for the accessible name when `tip` is given directly. */
    label?: string
  } = $props()

  const text = $derived(tip ?? (termKey ? glossaryDef(termKey) : ''))
  const name = $derived(
    termKey ? `${glossaryTerm(termKey)}: ${glossaryDef(termKey)}` : label ? `${label}: ${text}` : text,
  )
</script>

<button
  type="button"
  class="tv-infotip inline-grid size-4 shrink-0 cursor-help place-items-center rounded-full text-muted transition-colors duration-150 ease-standard hover:text-brand focus-visible:text-brand"
  title={text}
  aria-label={name}
>
  <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
    <circle cx="8" cy="8" r="6.75" stroke="currentColor" stroke-width="1.3" fill="none" />
    <path d="M8 7.25V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    <circle cx="8" cy="5" r="0.9" fill="currentColor" />
  </svg>
</button>
