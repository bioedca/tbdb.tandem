<script lang="ts">
  // A small, keyboard- AND touch-reachable ⓘ affordance that reveals a one-line
  // definition (PLAN §8.5 accessibility; §8.1 voice). Used next to chart titles,
  // KPI labels, table headers, and control labels to resolve a term inline without
  // a separate glossary page. CHROME-only (muted/brand) so it never reads as a data
  // swatch (§8.2).
  //
  // The definition is shown in a real, styled popover — on hover (mouse), on focus
  // (keyboard) AND on tap (touch, which focuses the button) — instead of the native
  // `title` tooltip, which never fires on focus or touch and cannot be styled. The
  // popover is `position: fixed` (mirroring the PhyloTree tip), so it escapes any
  // `overflow:hidden` card/chart ancestor and renders in full, flipping above the
  // trigger and clamping to the viewport when there is no room below. The button's
  // `aria-label` carries the same term + definition, so a screen reader gets it from
  // the accessible name; the visual popover is `aria-hidden` to avoid a double read.
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
    /** Optional headword for the popover + accessible name when `tip` is given directly. */
    label?: string
  } = $props()

  const body = $derived(tip ?? (termKey ? glossaryDef(termKey) : ''))
  const headword = $derived(termKey ? glossaryTerm(termKey) : (label ?? ''))
  const name = $derived(
    termKey ? `${glossaryTerm(termKey)}: ${glossaryDef(termKey)}` : label ? `${label}: ${body}` : body,
  )

  let triggerEl = $state<HTMLButtonElement>()
  let popEl = $state<HTMLDivElement>()
  let hovered = $state(false)
  let focused = $state(false)
  // Escape dismisses the popover WITHOUT moving focus (WAI-ARIA tooltip pattern);
  // it is cleared by any fresh open intent (re-hover, or focus leaving and returning).
  let dismissed = $state(false)
  // Hover (mouse) OR focus (keyboard AND touch — a tap focuses the button) opens it,
  // so all three input modalities are covered without a fragile click-toggle.
  const open = $derived((hovered || focused) && !dismissed)
  let pos = $state({ left: 0, top: 0, ready: false })

  function reposition() {
    const trigger = triggerEl
    const pop = popEl
    if (!trigger || !pop) return
    const t = trigger.getBoundingClientRect()
    const p = pop.getBoundingClientRect()
    const margin = 8 // keep clear of the viewport edge
    const gap = 6 // space between trigger and popover
    const vw = window.innerWidth
    const vh = window.innerHeight
    // Prefer below the trigger; flip above only when it would overflow the bottom
    // and there is genuinely room above.
    let top = t.bottom + gap
    if (top + p.height > vh - margin && t.top - gap - p.height >= margin) {
      top = t.top - gap - p.height
    }
    // Final safety clamp into the viewport on both axes — covers triggers near an
    // edge (notably short mobile viewports) so the popover is never cut off.
    top = Math.min(Math.max(margin, top), Math.max(margin, vh - p.height - margin))
    let left = t.left + t.width / 2 - p.width / 2 // centre on the trigger
    left = Math.min(Math.max(margin, left), Math.max(margin, vw - p.width - margin))
    pos = { left, top, ready: true }
  }

  // Position once the popover is in the DOM (it renders hidden until `ready`, so it
  // never flashes at a stale spot), and keep it anchored while it is open. Capture
  // scroll so it tracks nested scrollers too. Reset `ready` on close so the next
  // open re-measures before showing.
  $effect(() => {
    if (!open || !popEl) return
    reposition()
    const onMove = () => reposition()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      pos = { ...pos, ready: false }
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  })
</script>

<button
  bind:this={triggerEl}
  type="button"
  class="tv-infotip inline-grid size-4 shrink-0 cursor-help place-items-center rounded-full text-muted transition-colors duration-150 ease-standard hover:text-brand focus-visible:text-brand"
  aria-label={name}
  onmouseenter={() => {
    hovered = true
    dismissed = false
  }}
  onmouseleave={() => (hovered = false)}
  onfocus={() => {
    focused = true
    dismissed = false
  }}
  onblur={() => {
    focused = false
    dismissed = false
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      dismissed = true
    }
  }}
>
  <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
    <circle cx="8" cy="8" r="6.75" stroke="currentColor" stroke-width="1.3" fill="none" />
    <path d="M8 7.25V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    <circle cx="8" cy="5" r="0.9" fill="currentColor" />
  </svg>
</button>

{#if open && body}
  <div
    bind:this={popEl}
    aria-hidden="true"
    class="tv-infotip-pop pointer-events-none fixed z-50 max-w-[18rem] rounded-md border border-hairline bg-ink px-3 py-2 text-left text-caption leading-relaxed text-chrome-fg shadow-md"
    style:left="{pos.left}px"
    style:top="{pos.top}px"
    style:visibility={pos.ready ? 'visible' : 'hidden'}
  >
    {#if headword}<span class="block font-semibold text-white">{headword}</span>{/if}
    <span class="block">{body}</span>
  </div>
{/if}
