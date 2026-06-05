<script lang="ts">
  // In-app RNA secondary structure (PLAN §9 detail flow, §7.1, §13). One tab per
  // element; the active element renders in one of TWO interchangeable viewers,
  // both colored by structural domain (Stem I / II / IIA-B / III / antiterminator)
  // from the SAME color.ts palette, and both backed by the guaranteed tbdb.io
  // VARNA deep-link:
  //
  //   • R2DT      — the RF00230 / T-box template layout (the recognizable, reproducible
  //                 textbook shape) with a real antiterminator hairpin folded in. The
  //                 template alone leaves the antiterminator unpaired, so build_r2dt.py's
  //                 `graft` stage folds it (and reflows the inter-stem single strands)
  //                 offline; assets are committed under public/data/r2dt/, fetched on
  //                 demand and drawn by R2dtDiagram.svelte. Default when available.
  //   • Fornac    — the legacy 2016 force-directed render of the whole-leader
  //                 antiterminator conformation (best-effort; PLAN §13).
  //
  // ── fornac is legacy + fragile, so its path is defensive by design (PLAN §13) ──
  //   • Loaded by a classic <script> (lib/fornac.ts) so the 2016 UMD (own d3 v3)
  //     never touches the boot path and stays out of ESM strict mode; it is fetched
  //     only when the fornac view first mounts on /locus.
  //   • The import AND the render are both guarded: any failure falls back cleanly
  //     to the VARNA deep-link (shown regardless).
  //   • fornac self-injects a bare-tag `svg { width/min-*: 100% }` stylesheet;
  //     `app.css`'s `.tv-app svg { min-*: 0 }` neutralizes that leak app-wide, and
  //     the scoped rule below re-sizes fornac's own graph inside .tv-rna.
  //   • The fornac render basis (whole-leader antiterminator structure) is chosen in
  //     `rna.ts` — the Stem-I alignment column carries non-nucleotide junk.
  import type { Member } from '../data/types'
  import {
    swatchBackground,
    STEM_META,
    FEATURE_OVERLAY_META,
    buildStemColorMap,
    TERMINATOR_COLOR,
    STEM_LINKER_COLOR,
  } from '../color'
  import InfoTip from './InfoTip.svelte'
  import TbdbLink from './TbdbLink.svelte'
  import R2dtDiagram from './R2dtDiagram.svelte'
  import { leaderRnaModel, terminatorRnaModel, varnaLink, type RnaModel } from '../rna'
  import { overlayFeatures } from '../sequence'
  import { loadFornac, type FornaContainerCtor } from '../fornac'
  import {
    loadR2dtManifest,
    loadR2dtDiagram,
    loadTerminatorManifest,
    loadTerminatorDiagram,
    type R2dtDiagram as R2dtDiagramData,
  } from '../r2dt'

  let { members }: { members: Member[] } = $props()

  const HOST_H = 384 // px — fallback host height when clientHeight is 0 (fornac reads
  // the host's offsetHeight at construction; the host box itself is a responsive clamp
  // in the template, and fornac's own resize listener + the 100%-fill svg keep it fitted)

  const els = $derived([...members].sort((a, b) => a.ordinal - b.ordinal))
  let active = $state(0)
  // keep the active index in range when the member set changes
  $effect(() => {
    if (active >= els.length) active = 0
  })

  const member = $derived(els[active] ?? null)
  const deepLink = $derived(member ? varnaLink(member) : null)
  // Conserved-motif overlay (specifier loop + 5′-UGGN-3′ T-box motif) — the SAME
  // spans the sequence view paints, fed to BOTH viewers so the emphasis matches.
  const features = $derived(member ? overlayFeatures(member) : [])

  // ── Conformation toggle (Antiterminator ⇄ Terminator) ───────────────────────
  // Orthogonal to the R2DT/fornac viewer toggle: which FOLD is shown — the gene-ON
  // antiterminator (the leader/RF00230 fold) or the gene-OFF terminator hairpin. The
  // terminator is its own sequence + structure, so it drives a separate model + diagram.
  type Conformation = 'antiterm' | 'term'
  let conformation = $state<Conformation>('antiterm')
  const hasTerminator = $derived(!!member && terminatorRnaModel(member) !== null)
  // An element with no terminator can't show that conformation — fall back to antiterm.
  $effect(() => {
    if (!hasTerminator && conformation === 'term') conformation = 'antiterm'
  })
  const isTerm = $derived(conformation === 'term')

  const model = $derived<RnaModel | null>(
    !member ? null : isTerm ? terminatorRnaModel(member) : leaderRnaModel(member),
  )

  // ── Viewer toggle (R2DT ⇄ fornac) ───────────────────────────────────────────
  type ViewMode = 'r2dt' | 'fornac'
  // null = auto: prefer R2DT where a committed diagram exists, else fornac. A user
  // click pins the choice across element tabs (a per-element auto-flip would be
  // disorienting). R2DT is the canonical layout, so it leads when present.
  let chosen = $state<ViewMode | null>(null)

  // R2DT availability manifests (loaded once each; absent → fornac-only, graceful) —
  // one for the antiterminator diagrams, one for the standalone terminator diagrams.
  let r2dtAvail = $state<Record<string, { template: string | null; source: string | null }>>({})
  let termAvail = $state<Record<string, { template: string | null; source: string | null }>>({})
  let manifestLoaded = $state(false)
  $effect(() => {
    loadR2dtManifest().then((m) => {
      if (m) r2dtAvail = m.diagrams
      manifestLoaded = true // even on null: the availability question is now answered
    })
    loadTerminatorManifest().then((m) => {
      if (m) termAvail = m.diagrams
    })
  })
  // R2DT diagram availability for the CURRENT conformation.
  const avail = $derived(isTerm ? termAvail : r2dtAvail)
  const r2dtHere = $derived(!!member && member.member_id in avail)
  const view = $derived<ViewMode>(chosen ?? (r2dtHere ? 'r2dt' : 'fornac'))
  const r2dtTemplate = $derived(member ? (r2dtAvail[member.member_id]?.template ?? 'T-box') : 'T-box')

  // The active member's R2DT diagram, fetched on demand (cached in lib/r2dt.ts).
  let r2dtData = $state<R2dtDiagramData | null>(null)
  let r2dtLoading = $state(false)
  $effect(() => {
    const id = member?.member_id
    const term = isTerm
    // Drop the previous element's diagram synchronously so a stale one is never
    // painted with the new element's stems / wrong conformation while the new fetch is
    // in flight (mirrors the fornac path's el.innerHTML='' reset).
    r2dtData = null
    if (view !== 'r2dt' || !id || !(id in (term ? termAvail : r2dtAvail))) {
      r2dtLoading = false
      return
    }
    let cancelled = false
    r2dtLoading = true
    const load = term ? loadTerminatorDiagram : loadR2dtDiagram
    load(id).then((d) => {
      if (!cancelled) {
        r2dtData = d
        r2dtLoading = false
      }
    })
    return () => {
      cancelled = true
    }
  })

  // Stem-overlay legend: the labelled domains actually present on the active
  // element (degenerate elements omit some), in canonical 5′→3′ order (PLAN §9).
  // Shared by both viewers (both color by `member.stems`).
  const legendStems = $derived.by(() => {
    const present = new Set((member?.stems ?? []).map((s) => s.key))
    return STEM_META.filter((s) => present.has(s.key))
  })
  // Conserved-motif legend entries actually present on the active element (deeper
  // shade of the parent stem): specifier loop + 5′-UGGN-3′ T-box motif.
  const legendFeatures = $derived.by(() => {
    const present = new Set(features.map((f) => f.key))
    return FEATURE_OVERLAY_META.filter((f) => present.has(f.key))
  })

  function ordinalLabel(ordinal: number, n: number): string {
    if (ordinal === 1) return "5′ (1)"
    if (ordinal === n) return `3′ (${ordinal})`
    return `mid (${ordinal})`
  }

  // ── fornac loader (lazy; only when the fornac view is actually shown) ──────────
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
    // Don't fetch the legacy UMD unless fornac is the resolved viewer. Gate on the
    // manifest too: until it resolves, `view` provisionally reads 'fornac', so an
    // element that will default to R2DT must not pull fornac in that brief window.
    if (view !== 'fornac' || !manifestLoaded) return
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

  // (Re)render fornac whenever the loader, host, or active model is ready. NOTE: this
  // effect deliberately does not read `renderFailed` (it only writes it) — that
  // avoids a mount/unmount loop with the {#if} guard in the template. The host only
  // exists in the DOM while the fornac view is active, so this is naturally gated.
  $effect(() => {
    const el = host
    const ctor = Forna
    const m = model
    const term = isTerm
    const name = member?.unique_name ?? ''
    const stems = member?.stems ?? []
    const feats = member ? overlayFeatures(member) : []
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
      const height = el.clientHeight || HOST_H
      const container = new ctor(el, {
        applyForce: !reducedMotion,
        allowPanningAndZooming: true,
        initialSize: [width, height],
      })
      container.addRNA(m.structure, { sequence: m.sequence, name })

      // Per-nucleotide color overlay (PLAN §9). fornac returns a non-numeric custom value
      // verbatim as the node fill, so we map nucleotide number → hex. Antiterminator: the
      // shared stem + motif map the R2DT diagram also uses (so both viewers match). Terminator:
      // the paired residues (the terminator stem) in the terminator hue, rest quiet grey.
      let colorValues: Record<number, string>
      if (term) {
        colorValues = {}
        for (let i = 1; i <= m.structure.length; i++) {
          colorValues[i] = m.structure[i - 1] === '.' ? STEM_LINKER_COLOR : TERMINATOR_COLOR
        }
      } else {
        colorValues = buildStemColorMap(stems, m.sequence.length, feats)
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

  const showFornac = $derived(view === 'fornac' && !!model && !!Forna && !renderFailed)
  const showR2dt = $derived(view === 'r2dt' && r2dtHere && !!r2dtData)

  // Scroll-to-zoom (fornac only) must never chain to the page. fornac's legacy d3 v3
  // zoom only cancels the page-scroll default for wheel-down, so wheel-up zooms AND
  // scrolls the window. Cancel the default ourselves in BOTH directions with a
  // non-passive listener — fornac still zooms; only the page scroll is suppressed.
  // (The R2DT diagram is a static SVG and does not capture the wheel.)
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
  <!-- Element tabs (one per member) + the viewer toggle -->
  <div class="flex flex-wrap items-center justify-between gap-2">
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
    {:else}
      <span></span>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      <!-- Conformation toggle: Antiterminator (gene-ON) vs Terminator (gene-OFF). The
           two competing folds of the same leader; orthogonal to the viewer toggle. The
           Terminator option disables for the elements with no terminator. -->
      <div
        role="group"
        aria-label="Conformation"
        class="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-hairline p-0.5"
      >
        <button
          type="button"
          aria-pressed={!isTerm}
          title="Antiterminator (gene-ON) conformation"
          class="rounded-sm px-2 py-0.5 text-small transition-colors duration-150 ease-standard"
          class:bg-brand-subtle={!isTerm}
          class:text-ink={!isTerm}
          class:text-muted={isTerm}
          class:hover:text-ink={isTerm}
          onclick={() => (conformation = 'antiterm')}
        >
          Antiterminator
        </button>
        <button
          type="button"
          aria-pressed={isTerm}
          disabled={!hasTerminator}
          title={hasTerminator
            ? 'Terminator (gene-OFF) conformation'
            : 'No terminator annotated for this element'}
          class="rounded-sm px-2 py-0.5 text-small transition-colors duration-150 ease-standard disabled:cursor-not-allowed disabled:opacity-40"
          class:bg-brand-subtle={isTerm}
          class:text-ink={isTerm}
          class:text-muted={!isTerm}
          class:hover:text-ink={!isTerm && hasTerminator}
          onclick={() => (conformation = 'term')}
        >
          Terminator
        </button>
      </div>

      <!-- Viewer toggle: R2DT (canonical template) vs fornac (force layout). A
           segmented toggle-button group (aria-pressed), distinct from the element
           tablist above so the two never conflate. -->
      <div
        role="group"
        aria-label="Structure viewer"
        class="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-hairline p-0.5"
      >
        <button
          type="button"
          aria-pressed={view === 'r2dt'}
          title={isTerm
            ? 'Terminator hairpin layout (R2DT)'
            : 'RF00230 / T-box template layout (R2DT), antiterminator folded in'}
          class="rounded-sm px-2 py-0.5 text-small transition-colors duration-150 ease-standard"
          class:bg-brand-subtle={view === 'r2dt'}
          class:text-ink={view === 'r2dt'}
          class:text-muted={view !== 'r2dt'}
          class:hover:text-ink={view !== 'r2dt'}
          onclick={() => (chosen = 'r2dt')}
        >
          R2DT
        </button>
        <button
          type="button"
          aria-pressed={view === 'fornac'}
          title="Force-directed layout (fornac)"
          class="rounded-sm px-2 py-0.5 text-small transition-colors duration-150 ease-standard"
          class:bg-brand-subtle={view === 'fornac'}
          class:text-ink={view === 'fornac'}
          class:text-muted={view !== 'fornac'}
          class:hover:text-ink={view !== 'fornac'}
          onclick={() => (chosen = 'fornac')}
        >
          Fornac
        </button>
      </div>
    </div>
  </div>

  {#if member}
    <!-- Structure mount box (responsive clamp; fornac measures offsetHeight) -->
    <div
      class="tv-rna relative h-[clamp(18rem,46vh,24rem)] w-full overflow-hidden rounded-md border border-hairline bg-surface"
    >
      {#if view === 'r2dt'}
        {#if showR2dt && r2dtData}
          <div class="h-full w-full p-2">
            <R2dtDiagram
              diagram={r2dtData}
              stems={member.stems}
              {features}
              variant={isTerm ? 'terminator' : 'antiterm'}
            />
          </div>
        {:else}
          <div class="absolute inset-0 grid place-items-center p-6 text-center">
            <p class="max-w-sm text-small text-muted">
              {#if !r2dtHere}
                No R2DT diagram is available for this element. Switch to the Fornac view, or open the
                VARNA secondary-structure view on tbdb.io below.
              {:else if r2dtLoading}
                Loading the R2DT diagram…
              {:else}
                The R2DT diagram couldn't load.
                <br />
                Switch to the Fornac view or open the VARNA view on tbdb.io below.
              {/if}
            </p>
          </div>
        {/if}
      {:else if showFornac}
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

    <!-- Color key — the antiterminator stems + motifs, or (terminator conformation) the
         single terminator-stem key. Shown for whichever viewer is active. -->
    {#if showR2dt || showFornac}
      {#if isTerm}
        <ul
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted"
          aria-label="Terminator color key"
        >
          <li class="inline-flex items-center gap-1.5">
            <span
              class="size-2.5 rounded-sm ring-1 ring-ink/10"
              style:background={TERMINATOR_COLOR}
              aria-hidden="true"
            ></span>
            <span>Terminator stem</span>
          </li>
        </ul>
      {:else if legendStems.length || legendFeatures.length}
        <ul
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted"
          aria-label="Stem and motif color key"
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
          {#each legendFeatures as f (f.key)}
            <li class="inline-flex items-center gap-1.5">
              <span
                class="size-2.5 rounded-full ring-1 ring-ink/60"
                style:background={f.color}
                aria-hidden="true"
              ></span>
              <span>{f.label}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

    <!-- Caption + the GUARANTEED VARNA deep-link (always shown, per element) -->
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <p class="inline-flex items-center gap-1 text-caption text-muted">
        {#if showR2dt && isTerm}
          <span>
            Terminator (gene-OFF) conformation · R2DT — the alternative terminator hairpin laid out
            standalone from its own sequence + structure; the terminator stem is colored. The tbdb.io
            VARNA diagram is the reference drawing.
          </span>
        {:else if showR2dt}
          <span>
            {r2dtTemplate} template (RF00230) · R2DT, with the antiterminator folded in (antiterminator
            conformation); nucleotides are colored by structural domain{#if legendFeatures.length}, with
            the 5′-UGGN-3′ T-box motif and specifier loop shaded within their stems{/if}. The tbdb.io
            VARNA diagram is the reference drawing.
          </span>
        {:else if view === 'fornac'}
          <span>
            {#if model}{model.source} · {model.pairs} base pairs · {/if}fornac force layout — the base
            pairs are exact, but the layout is approximate; the tbdb.io VARNA diagram is the reference
            drawing.
          </span>
        {:else}
          <span>
            No R2DT diagram for this element — switch to Fornac, or open the tbdb.io VARNA
            secondary-structure view.
          </span>
        {/if}
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
     leak; here we (re)give fornac's own svg the full host box it expects. The R2DT
     diagram's own <svg> (also inside .tv-rna) reuses the same full-box sizing. */
  .tv-rna :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
