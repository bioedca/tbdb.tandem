<script lang="ts">
  // In-app RNA secondary structure (PLAN §9 detail flow, §7.1, §13). One tab per
  // element; the active element's whole-leader antiterminator conformation is
  // force-laid-out in-app by fornac (best-effort), and the tbdb.io VARNA view is
  // ALWAYS offered per element as the guaranteed path.
  //
  // ── fornac is legacy + fragile, so this is defensive by design (PLAN §13) ──────
  //   • Loaded by a dynamic import() so the 2016 UMD (with its own bundled d3 v3)
  //     never touches the boot path and its d3 v3 stays isolated in its module
  //     scope, away from the architecture diagram's / phylotree's d3 v7 (§7.1).
  //   • The import AND the render are both guarded: any failure falls back cleanly
  //     to the VARNA deep-link (which is shown regardless).
  //   • fornac self-injects a bare-tag `svg { width/min-*: 100% }` stylesheet on
  //     import; `app.css`'s `.tv-app svg { min-*: 0 }` neutralizes that leak app-
  //     wide, and the scoped rule below re-sizes fornac's own graph inside .tv-rna.
  //   • The render basis (whole-leader antiterminator structure) is chosen in
  //     `rna.ts` — the Stem-I alignment column carries non-nucleotide junk.
  import type { Member } from '../data/types'
  import { swatchBackground, STEM_COLORS, STEM_LINKER_COLOR, STEM_META } from '../color'
  import InfoTip from './InfoTip.svelte'
  import TbdbLink from './TbdbLink.svelte'
  import { leaderRnaModel, varnaLink, type RnaModel } from '../rna'
  import { loadFornac, type FornaContainerCtor } from '../fornac'

  let { members }: { members: Member[] } = $props()

  const HOST_H = 384 // px — fornac reads the host's offsetHeight; needs a real size

  const els = $derived([...members].sort((a, b) => a.ordinal - b.ordinal))
  let active = $state(0)
  // keep the active index in range when the member set changes
  $effect(() => {
    if (active >= els.length) active = 0
  })

  const member = $derived(els[active] ?? null)
  const model = $derived<RnaModel | null>(member ? leaderRnaModel(member) : null)
  const deepLink = $derived(member ? varnaLink(member) : null)

  // Stem-overlay legend: the labelled domains actually present on the active
  // element (degenerate elements omit some), in canonical 5′→3′ order (PLAN §9).
  const legendStems = $derived.by(() => {
    const present = new Set((member?.stems ?? []).map((s) => s.key))
    return STEM_META.filter((s) => present.has(s.key))
  })

  function ordinalLabel(ordinal: number, n: number): string {
    if (ordinal === 1) return "5′ (1)"
    if (ordinal === n) return `3′ (${ordinal})`
    return `mid (${ordinal})`
  }

  // ── fornac loader (lazy; resolves the FornaContainer constructor once) ──────────
  // The classic-script load (see lib/fornac.ts) keeps the legacy UMD off the boot
  // path and out of ESM strict mode.
  let Forna = $state<FornaContainerCtor | null>(null)
  let loadFailed = $state(false)
  let renderFailed = $state(false)
  let host = $state<HTMLDivElement | null>(null)

  // Honor prefers-reduced-motion (§8.4, CLAUDE §6): force-directed when motion is
  // allowed (§7.1), the deterministic static layout when the user opts out.
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  $effect(() => {
    let cancelled = false
    loadFornac()
      .then((ctor) => {
        if (!cancelled) Forna = ctor
      })
      .catch(() => {
        if (!cancelled) loadFailed = true
      })
    return () => {
      cancelled = true
    }
  })

  // Clear the failure flag when the active element changes (so a fresh element gets
  // a fresh attempt; the render effect below only ever SETS it on a throw).
  $effect(() => {
    void member?.member_id
    renderFailed = false
  })

  // (Re)render whenever the loader, host, or active model is ready. NOTE: this
  // effect deliberately does not read `renderFailed` (it only writes it) — that
  // avoids a mount/unmount loop with the {#if} guard in the template.
  $effect(() => {
    const el = host
    const ctor = Forna
    const m = model
    const name = member?.unique_name ?? ''
    const stems = member?.stems ?? []
    if (!el || !ctor || !m) return
    el.innerHTML = '' // drop any previous render before re-mounting

    // fornac binds a permanent window 'resize' listener inside its constructor and
    // exposes no teardown. Without intervention every tab switch / locus navigation
    // would leak one listener AND pin the detached container's force-graph in memory.
    // Intercept window.addEventListener for the (synchronous) construction so we can
    // capture exactly what fornac registers and remove it in the effect cleanup —
    // bounding live fornac listeners to at most one (the current element).
    const leaked: Array<[EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = []
    const origAdd = window.addEventListener
    window.addEventListener = function (
      this: Window,
      type: string,
      handler: EventListenerOrEventListenerObject,
      opts?: boolean | AddEventListenerOptions,
    ) {
      if (type === 'resize') leaked.push([handler, opts])
      return (
        origAdd as (
          t: string,
          h: EventListenerOrEventListenerObject,
          o?: boolean | AddEventListenerOptions,
        ) => void
      ).call(this, type, handler, opts)
    } as typeof window.addEventListener

    try {
      const width = el.clientWidth || 600
      const container = new ctor(el, {
        applyForce: !reducedMotion,
        allowPanningAndZooming: true,
        initialSize: [width, HOST_H],
      })
      container.addRNA(m.structure, { sequence: m.sequence, name })

      // Per-stem color overlay (PLAN §9): paint each nucleotide by the structural
      // domain it sits in (Stem I / II / IIA-B / III / antiterminator); linkers stay
      // a quiet grey. fornac returns a non-numeric custom value verbatim as the node
      // fill, so we map nucleotide number → hex directly (structName === name).
      const colorValues: Record<number, string> = {}
      const len = m.sequence.length
      for (let i = 1; i <= len; i++) colorValues[i] = STEM_LINKER_COLOR
      for (const s of stems) {
        const col = STEM_COLORS[s.key]
        if (!col) continue
        for (let p = Math.max(1, s.start); p <= Math.min(len, s.end); p++) colorValues[p] = col
      }
      container.addCustomColors({ colorValues: { [name]: colorValues } })
      container.changeColorScheme('custom')
    } catch {
      renderFailed = true
      el.innerHTML = ''
    } finally {
      window.addEventListener = origAdd
    }

    return () => {
      el.innerHTML = ''
      for (const [handler, opts] of leaked) {
        window.removeEventListener('resize', handler, opts as boolean | EventListenerOptions | undefined)
      }
    }
  })

  const showViewer = $derived(!!model && !!Forna && !renderFailed)

  // Scroll-to-zoom must never chain to the page. fornac's legacy d3 v3 zoom only
  // cancels the page-scroll default for one wheel direction (wheel-down), so
  // wheel-up zooms AND scrolls the window. Cancel the default ourselves in BOTH
  // directions with a non-passive listener (passive:false so preventDefault takes
  // effect) — fornac still receives the event and zooms; only the page scroll is
  // suppressed. (The similarity-map tree handles this itself via d3 v7.)
  function lockWheel(node: HTMLElement) {
    const onWheel = (e: WheelEvent) => e.preventDefault()
    node.addEventListener('wheel', onWheel, { passive: false })
    return {
      destroy() {
        node.removeEventListener('wheel', onWheel)
      },
    }
  }
</script>

<div class="space-y-3">
  <!-- Per-element tabs (one tab per member; PLAN §9 "tabs per element") -->
  {#if els.length > 1}
    <div role="tablist" aria-label="Elements" class="flex flex-wrap gap-1.5">
      {#each els as m, i (m.member_id)}
        <button
          type="button"
          role="tab"
          aria-selected={i === active}
          class="inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-small transition-colors duration-150 ease-standard"
          class:border-brand={i === active}
          class:bg-brand-subtle={i === active}
          class:text-ink={i === active}
          class:border-hairline={i !== active}
          class:text-muted={i !== active}
          class:hover:text-ink={i !== active}
          onclick={() => (active = i)}
        >
          <span
            class="size-3 rounded-sm ring-1 ring-ink/10"
            style:background={swatchBackground(m.specifier.aa)}
            aria-hidden="true"
          ></span>
          <span class="font-mono text-caption">{ordinalLabel(m.ordinal, els.length)}</span>
          <span class="font-mono font-medium">{m.specifier.aa ?? '?'}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if member}
    <!-- fornac mount target (explicit height — fornac measures offsetHeight) -->
    <div
      class="tv-rna relative w-full overflow-hidden rounded-md border border-hairline bg-surface-subtle"
      style:height="{HOST_H}px"
    >
      {#if showViewer}
        <div bind:this={host} use:lockWheel class="h-full w-full" aria-label="RNA secondary structure"></div>
      {:else}
        <div class="absolute inset-0 grid place-items-center p-6 text-center">
          <p class="max-w-sm text-small text-muted">
            {#if !model}
              No in-app preview is available for this element.
            {:else if loadFailed || renderFailed}
              The in-app structure viewer couldn't load.
            {:else}
              Loading the structure viewer…
            {/if}
            <br />
            Open the VARNA secondary-structure view on tbdb.io below.
          </p>
        </div>
      {/if}
    </div>

    <!-- Stem color key (only the domains present on the active element) -->
    {#if showViewer && legendStems.length}
      <ul
        class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted"
        aria-label="Stem color key"
      >
        {#each legendStems as s (s.key)}
          <li class="inline-flex items-center gap-1.5">
            <span
              class="size-2.5 rounded-sm ring-1 ring-ink/10"
              style:background={s.color}
              aria-hidden="true"
            ></span>
            <span>{s.label}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Caption + the GUARANTEED VARNA deep-link (always shown, per element) -->
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <p class="inline-flex items-center gap-1 text-caption text-muted">
        <span>
          {#if model}{model.source} · {model.pairs} base pairs · {/if}in-app preview — the
          base pairs are exact, but the layout is approximate; the tbdb.io VARNA diagram is
          the reference drawing.
        </span>
        <InfoTip term="varna" />
      </p>
      {#if deepLink}
        <TbdbLink
          href={deepLink.href}
          title={deepLink.varna
            ? `VARNA secondary-structure view on tbdb.io for ${member.unique_name}`
            : 'NCBI coordinate record (structure-view fallback)'}
        >
          {deepLink.varna ? 'VARNA structure on tbdb.io' : 'NCBI record'}
        </TbdbLink>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* fornac renders its force graph as an <svg> inside this host. `app.css` resets
     `min-*` on every app svg to undo fornac's injected global `svg { min-*:100% }`
     leak; here we (re)give fornac's own svg the full host box it expects. */
  .tv-rna :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
