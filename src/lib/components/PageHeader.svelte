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
    aside,
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
    /** Optional secondary block (a "how to read" note / disclaimer banner). When given,
     *  the masthead becomes two columns on wide screens — the measure-capped lead on the
     *  left, this block pulled up-and-right — so the standfirst keeps its reading measure
     *  AND the otherwise-empty right half of a wide masthead carries something useful. It
     *  stacks under the lead below `xl`. */
    aside?: Snippet
  } = $props()
</script>

<header>
  {#if kicker}
    <!-- The page-category eyebrow: a quiet muted uppercase label (brand is reserved strictly
         for interactive affordances, so a non-interactive kicker no longer borrows it). -->
    <p class="mb-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-muted">
      {kicker}
    </p>
  {/if}
  <h1
    use:fitText={{ minPx: titleMinPx }}
    class="text-hero tracking-tight text-ink {mono ? 'font-mono' : ''}"
  >{title}</h1>
  {#if aside}
    <!-- Two-column masthead (≥xl): lead left (its own max-w-measure caps the `auto` track
         to a reading measure), aside pulled to the right edge. Stacks below xl. -->
    <div class="mt-3 grid gap-y-4 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-start xl:gap-x-10">
      <div class="min-w-0">{@render children?.()}</div>
      <div class="min-w-0 xl:max-w-sm xl:justify-self-end">{@render aside()}</div>
    </div>
  {:else if children}
    <div class="mt-3">{@render children()}</div>
  {/if}
</header>
