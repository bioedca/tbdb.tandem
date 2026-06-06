<script lang="ts">
  // Page masthead (PLAN §8) — the SINGLE page-header treatment shared by every route, so
  // the top of Dashboard / Browse / Similarity map / Cloud / About / a locus detail all
  // read with identical hierarchy: a small uppercase kicker, the hero title, then the lead.
  //
  //   KICKER      — caption-size, brand, uppercase: the page category (orientation cue)
  //   title <h1>  — the `text-hero` tier, `use:fitText` so a long title never overflows on a
  //                 phone and re-grows to the fluid clamp() max on a wide screen (one line)
  //   children    — the lead/standfirst (and, on a locus, its at-a-glance chips); each route
  //                 supplies a `text-lead … max-w-measure` paragraph so prose stays readable
  //
  // Centralising it here is what makes the masthead cohesive: there is exactly one place that
  // defines kicker styling, hero sizing, and the title→lead rhythm.
  import type { Snippet } from 'svelte'
  import { fitText } from '../actions/fitText'

  let {
    kicker,
    title,
    mono = false,
    titleMinPx = 20,
    children,
  }: {
    /** Small uppercase eyebrow above the title — the page category (e.g. "Overview"). */
    kicker?: string
    /** Page title text. Single line; sized by `use:fitText` against its real box width. */
    title: string
    /** Render the title in the mono face (used for a locus ID, e.g. "T0342"). */
    mono?: boolean
    /** Floor (px) for the fitText shrink on very narrow screens. */
    titleMinPx?: number
    /** The lead / standfirst (and any header meta) rendered under the title. */
    children?: Snippet
  } = $props()
</script>

<header>
  {#if kicker}
    <p class="mb-1.5 text-caption font-semibold uppercase tracking-[0.14em] text-brand">
      {kicker}
    </p>
  {/if}
  <h1
    use:fitText={{ minPx: titleMinPx }}
    class="text-hero tracking-tight text-ink {mono ? 'font-mono' : ''}"
  >{title}</h1>
  {#if children}
    <div class="mt-3">{@render children()}</div>
  {/if}
</header>
