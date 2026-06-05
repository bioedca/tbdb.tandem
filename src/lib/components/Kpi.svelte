<script lang="ts">
  // KPI tile (PLAN §8.5, §9 dashboard strip). A big mono value over a caption
  // label, on the standard card surface. The value is mono so digits align (§8.3).
  // An optional `tip` (a glossary key or literal text) attaches an inline ⓘ next to
  // the label so a newcomer can resolve the term in place (first-contact clarity).
  import InfoTip from './InfoTip.svelte'
  import { fitText } from '../actions/fitText'
  import type { GlossaryKey } from '../glossary'

  let {
    label,
    value,
    hint,
    term,
    tip,
  }: {
    label: string
    value: string | number
    hint?: string
    /** Glossary key whose definition is shown in the label's ⓘ tooltip. */
    term?: GlossaryKey
    /** Literal tooltip text (overrides `term`). */
    tip?: string
  } = $props()
</script>

<div class="rounded-panel border border-hairline bg-surface px-5 py-4 shadow-sm">
  <div class="flex items-center gap-1 text-caption font-medium uppercase tracking-wide text-muted">
    <span>{label}</span>
    {#if term || tip}<InfoTip {term} {tip} {label} />{/if}
  </div>
  <!-- The value sits in the fluid `text-display` ramp; `fitText` then shrinks it
       reflow-free (pretext) only when a wide value would overflow its tile, so e.g.
       "23,500" or "5 / 12" never clip in a narrow 2-column mobile tile. -->
  <div
    use:fitText={{ minPx: 16 }}
    class="mt-1 overflow-hidden font-mono text-display leading-none whitespace-nowrap text-ink tabular-nums"
  >{value}</div>
  {#if hint}<div class="mt-1 text-small text-muted">{hint}</div>{/if}
</div>
