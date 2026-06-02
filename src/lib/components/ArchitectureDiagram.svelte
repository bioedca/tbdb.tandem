<script lang="ts">
  // Tandem-architecture diagram (PLAN §9①) — the signature view tbdb.io lacks.
  // A to-scale, biological-5′→3′ locus track: per element a specifier-tinted body
  // (the T-box), Stem-I (loop notched), the specifier-codon tick + AA code, the
  // antiterminator (outline), the terminator hairpin (or a schematic anti-SD
  // sequestrator for Translational elements — NOT a coordinate-precise SD hexamer,
  // since no SD field exists), and the discriminator; a dashed inter-element spacer
  // labelled with its bp gap; and a function-class-tagged downstream-ORF block arrow.
  // Mixed loci read two-tone because each body is tinted by ITS OWN specifier (§9①).
  //
  // Per §7.1 this is "D3 + hand-rolled SVG": D3 supplies ONLY the linear position
  // scale; every glyph is plain SVG in this template. A fixed viewBox keeps the
  // render deterministic for the S3.4 visual-regression baselines. The geometry is
  // the pure, unit-tested model in `architecture.ts`.
  import { scaleLinear } from 'd3'
  import type { FuncClass, FuncSource, Member, Strand } from '../data/types'
  import { aaColor } from '../color'
  import { neutral } from '../design/tokens'
  import { buildArchitecture, type ElementLayout, type FeatureBox } from '../architecture'

  let {
    members,
    strand,
    funcClass,
    funcSource = 'none',
    downstreamGene = null,
  }: {
    members: Member[]
    strand: Strand
    funcClass: FuncClass
    funcSource?: FuncSource
    downstreamGene?: string | null
  } = $props()

  const model = $derived(buildArchitecture(members, strand))

  // ── Fixed viewBox geometry (deterministic; scaled into via D3) ──────────────────
  const W = 1000
  const H = 152
  const PAD_L = 12
  const PAD_R = 12
  const ORF_ZONE = 156 // fixed schematic zone for the downstream ORF (no real coords)
  const ORF_GAP = 26
  const TRACK_L = PAD_L
  const TRACK_R = W - PAD_R - ORF_ZONE

  // Vertical bands.
  const Y_AA = 18 // specifier-codon AA label baseline
  const Y_LOOP = 48 // Stem-I terminal loop centre
  const Y_BODY_T = 66
  const BODY_H = 30
  const Y_BODY_B = Y_BODY_T + BODY_H // 96
  const Y_BODY_MID = Y_BODY_T + BODY_H / 2 // 81
  const Y_CHEVRON = 110
  const Y_GAP_LABEL = 122
  const Y_SCALE = 134

  const MIN_W = 2.5
  const LOOP_R = 6.5

  // Map the biological axis [0, span] onto the track pixel range (D3, scales only).
  const x = $derived(
    scaleLinear()
      .domain([0, Math.max(model.span, 1)])
      .range([TRACK_L, TRACK_R])
      .clamp(true),
  )

  /** Pixel `{x, w}` of a feature box (min width so tiny features stay visible). */
  function band(box: FeatureBox, min = MIN_W): { x: number; w: number } {
    const a = x(box.start)
    const b = x(box.end)
    return { x: a, w: Math.max(b - a, min) }
  }

  /** Pixel x of a feature box centre (for point glyphs: codon tick, loop, discrim). */
  function centre(box: FeatureBox): number {
    return (x(box.start) + x(box.end)) / 2
  }

  function bodyRect(el: ElementLayout): { x: number; w: number } {
    const a = x(el.bodyStart)
    const b = x(el.bodyEnd)
    return { x: a, w: Math.max(b - a, 4) }
  }

  /** A terminator hairpin (∩) path centred at `cx`, apex above the body. */
  function hairpinPath(cx: number): string {
    const w = 7
    const apex = Y_BODY_T - 22
    return `M ${cx - w} ${Y_BODY_T} L ${cx - w} ${apex + w} A ${w} ${w} 0 0 1 ${cx + w} ${apex + w} L ${cx + w} ${Y_BODY_T}`
  }

  /** A small downstream-ORF block arrow (rightward = 5′→3′) in the schematic zone. */
  const orf = $derived.by(() => {
    const x0 = TRACK_R + ORF_GAP
    const x1 = W - PAD_R
    const tip = 16
    const t = Y_BODY_MID - 13
    const b = Y_BODY_MID + 13
    const m = Y_BODY_MID
    const points = `${x0},${t} ${x1 - tip},${t} ${x1},${m} ${x1 - tip},${b} ${x0},${b}`
    return { points, cx: (x0 + x1) / 2, x0, x1 }
  })

  // Downstream ORF fill — NEUTRAL chrome shades keyed by func_class, never a
  // specifier hue (§8.2 chrome⟂data invariant). Labels carry the class name.
  const FUNC_SHADE: Record<FuncClass, string> = {
    aaRS: '#475569', // slate-600
    biosynthesis: '#64748b', // slate-500
    transporter: '#94a3b8', // slate-400
    oxidoreductase: '#334155', // slate-700
    unknown: '#cbd5e1', // slate-300
  }
  const orfFill = $derived(FUNC_SHADE[funcClass])
  const orfDark = $derived(funcClass !== 'unknown' && funcClass !== 'transporter')

  // Strand chevrons along the baseline — they point in the transcription direction,
  // which on this axis is always rightward (the axis IS biological 5′→3′).
  const CHEVRONS = 6
  function chevronX(i: number): number {
    return TRACK_L + ((TRACK_R - TRACK_L) * (i + 0.5)) / CHEVRONS
  }

  /** Largest "nice" bp length ≤ a third of the span, for the scale bar. */
  const scaleBp = $derived.by(() => {
    const target = model.span / 3
    const steps = [25, 50, 100, 200, 250, 500, 1000, 2000]
    let pick = steps[0]
    for (const s of steps) if (s <= target) pick = s
    return pick
  })
  const scaleW = $derived(x(scaleBp) - x(0))

  function ordinalTag(ordinal: number, n: number): string {
    if (ordinal === 1) return '5′'
    if (ordinal === n) return '3′'
    return String(ordinal)
  }
</script>

<figure class="tv-arch w-full">
  <svg
    viewBox="0 0 {W} {H}"
    preserveAspectRatio="xMidYMid meet"
    class="w-full"
    role="img"
    aria-label="Tandem architecture: {model.elements.length} T-box elements, biological 5′ to 3′, {strand} strand; downstream {funcClass} operon."
  >
    <!-- Backbone -->
    <line
      x1={TRACK_L}
      y1={Y_BODY_MID}
      x2={orf.x0 - 4}
      y2={Y_BODY_MID}
      stroke={neutral.hairline}
      stroke-width="2"
    />

    <!-- 5′ / 3′ end caps -->
    <text x={TRACK_L} y={Y_BODY_B + 14} class="tv-arch-end" text-anchor="start">5′</text>
    <text x={TRACK_R} y={Y_BODY_B + 14} class="tv-arch-end" text-anchor="end">3′</text>

    <!-- Strand chevrons (transcription direction = rightward on the 5′→3′ axis) -->
    {#each Array(CHEVRONS) as _, i (i)}
      {@const cx = chevronX(i)}
      <path
        d="M {cx - 3} {Y_CHEVRON - 4} L {cx + 3} {Y_CHEVRON} L {cx - 3} {Y_CHEVRON + 4}"
        fill="none"
        stroke={neutral.muted}
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.7"
      />
    {/each}

    <!-- Inter-element spacers: a dashed gap, or an explicit overlap/nest marker
         (~6% of loci have overlapping leader annotations — never shown silently as
         a clean tandem gap). -->
    {#each model.spacers as sp, i (i)}
      {#if sp.overlap}
        {@const ox1 = x(sp.end)}
        {@const ox2 = x(sp.start)}
        <rect
          class="tv-arch-overlap"
          data-overlap={-sp.gap}
          x={ox1}
          y={Y_BODY_MID - 3}
          width={Math.max(ox2 - ox1, 2)}
          height="6"
          fill={neutral.muted}
          fill-opacity="0.4"
        />
        <text x={(ox1 + ox2) / 2} y={Y_GAP_LABEL} class="tv-arch-gap" text-anchor="middle">
          {-sp.gap} bp overlap
        </text>
      {:else if sp.gap > 0}
        <line
          x1={x(sp.start)}
          y1={Y_BODY_MID}
          x2={x(sp.end)}
          y2={Y_BODY_MID}
          stroke={neutral.muted}
          stroke-width="1.4"
          stroke-dasharray="3 3"
          class="tv-arch-spacer"
        />
        <text x={(x(sp.start) + x(sp.end)) / 2} y={Y_GAP_LABEL} class="tv-arch-gap" text-anchor="middle">
          {sp.gap} bp
        </text>
      {/if}
    {/each}

    <!-- Elements (biological 5′→3′) -->
    {#each model.elements as el (el.member.member_id)}
      {@const tint = aaColor(el.aa)}
      {@const body = bodyRect(el)}
      <g class="tv-arch-element" data-ordinal={el.ordinal} data-aa={el.aa ?? '?'}>
        <!-- Element body (the T-box), tinted by its OWN specifier -->
        <rect
          class="tv-arch-body"
          x={body.x}
          y={Y_BODY_T}
          width={body.w}
          height={BODY_H}
          rx="4"
          fill={tint}
          fill-opacity="0.16"
          stroke={tint}
          stroke-width="1.6"
        />

        <!-- Stem-I stem band -->
        {#if el.features.s1}
          {@const s1 = band(el.features.s1)}
          <rect
            class="tv-arch-feature tv-arch-stem1"
            data-feature="s1"
            x={s1.x}
            y={Y_BODY_T + 4}
            width={s1.w}
            height="9"
            rx="3"
            fill={tint}
            fill-opacity="0.5"
            stroke={tint}
            stroke-width="0.8"
          />
        {/if}

        <!-- Stem-I terminal loop (loop notched) — guarded independently of the stem
             band so a loop-only member (valid s1_loop, s1 absent) still draws it. -->
        {#if el.features.s1_loop}
          {@const lx = centre(el.features.s1_loop)}
          <g class="tv-arch-feature tv-arch-stem1-loop" data-feature="s1_loop">
            <line x1={lx} y1={Y_BODY_T + 4} x2={lx} y2={Y_LOOP + LOOP_R} stroke={tint} stroke-width="1.2" />
            <!-- loop with a notch (gap in the arc) -->
            <path
              d="M {lx - LOOP_R} {Y_LOOP} A {LOOP_R} {LOOP_R} 0 1 1 {lx + LOOP_R * 0.5} {Y_LOOP + LOOP_R * 0.87}"
              fill="none"
              stroke={tint}
              stroke-width="1.4"
            />
          </g>
        {/if}

        <!-- Antiterminator: outline only -->
        {#if el.features.antiterm}
          {@const at = band(el.features.antiterm)}
          <rect
            class="tv-arch-feature tv-arch-antiterm"
            data-feature="antiterm"
            x={at.x}
            y={Y_BODY_MID + 2}
            width={at.w}
            height={Y_BODY_B - (Y_BODY_MID + 2) - 2}
            rx="2"
            fill="none"
            stroke={neutral.muted}
            stroke-width="1.2"
            stroke-dasharray="2 1.6"
          />
        {/if}

        <!-- Terminator hairpin (Transcriptional) / anti-SD sequestrator (Translational) -->
        {#if el.features.term}
          {@const tcx = centre(el.features.term)}
          {#if el.member.type === 'Translational'}
            <g class="tv-arch-feature tv-arch-term tv-arch-term-sd" data-feature="term">
              <path
                d="M {tcx - 7} {Y_BODY_T - 4} q 0 -8 7 -8 q 7 0 7 8"
                fill="none"
                stroke={neutral.ink}
                stroke-width="1.3"
                stroke-dasharray="2 1.5"
              />
              <text x={tcx} y={Y_BODY_T - 16} class="tv-arch-sd-label" text-anchor="middle">SD?</text>
            </g>
          {:else}
            <path
              class="tv-arch-feature tv-arch-term tv-arch-term-hairpin"
              data-feature="term"
              d={hairpinPath(tcx)}
              fill="none"
              stroke={neutral.ink}
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          {/if}
        {/if}

        <!-- Discriminator: small diamond at the body baseline -->
        {#if el.features.discrim}
          {@const dcx = centre(el.features.discrim)}
          <path
            class="tv-arch-feature tv-arch-discrim"
            data-feature="discrim"
            d="M {dcx} {Y_BODY_B - 4} l 3 3 l -3 3 l -3 -3 z"
            fill={neutral.muted}
          />
        {/if}

        <!-- Specifier codon: bold tick through the body + AA code above -->
        {#if el.features.codon}
          {@const ccx = centre(el.features.codon)}
          <g class="tv-arch-feature tv-arch-codon" data-feature="codon">
            <line x1={ccx} y1={Y_BODY_T - 2} x2={ccx} y2={Y_BODY_B + 2} stroke={neutral.ink} stroke-width="2.4" />
            <text x={ccx} y={Y_AA} class="tv-arch-aa" text-anchor="middle" fill={tint}>{el.aa ?? '?'}</text>
          </g>
        {/if}

        <!-- Ordinal tag under the body -->
        <text x={(body.x + body.x + body.w) / 2} y={Y_BODY_B + 14} class="tv-arch-ord" text-anchor="middle">
          {ordinalTag(el.ordinal, model.elements.length)}
        </text>
      </g>
    {/each}

    <!-- Downstream-ORF block arrow (function-class tagged; schematic — no coords) -->
    <g class="tv-arch-orf" data-func={funcClass}>
      <polygon points={orf.points} fill={orfFill} stroke={neutral.muted} stroke-width="0.8" />
      <text
        x={orf.cx}
        y={Y_BODY_MID + 3.5}
        class="tv-arch-orf-label"
        text-anchor="middle"
        fill={orfDark ? '#ffffff' : neutral.ink}
      >
        {funcClass}{#if funcSource === 'text'}*{/if}
      </text>
      <text x={orf.cx} y={Y_BODY_B + 14} class="tv-arch-orf-sub" text-anchor="middle">
        {downstreamGene ? (downstreamGene.length > 22 ? downstreamGene.slice(0, 21) + '…' : downstreamGene) : 'downstream operon'}
      </text>
    </g>

    <!-- Scale bar -->
    <g class="tv-arch-scale">
      <line x1={TRACK_L} y1={Y_SCALE} x2={TRACK_L + scaleW} y2={Y_SCALE} stroke={neutral.muted} stroke-width="1.4" />
      <line x1={TRACK_L} y1={Y_SCALE - 3} x2={TRACK_L} y2={Y_SCALE + 3} stroke={neutral.muted} stroke-width="1.4" />
      <line x1={TRACK_L + scaleW} y1={Y_SCALE - 3} x2={TRACK_L + scaleW} y2={Y_SCALE + 3} stroke={neutral.muted} stroke-width="1.4" />
      <text x={TRACK_L + scaleW + 6} y={Y_SCALE + 3.5} class="tv-arch-scale-label" text-anchor="start">{scaleBp} bp</text>
    </g>
  </svg>

  <figcaption class="sr-only">
    Tandem T-box architecture, {strand} strand, drawn biological 5′ to 3′ to scale.
  </figcaption>
</figure>

<style>
  /* Text glyphs read tokens via classes; sizes are SVG-unit absolutes (the viewBox
     is fixed) so they scale with the diagram. Colors come from @theme tokens. */
  .tv-arch-aa {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
  }
  .tv-arch-ord,
  .tv-arch-end {
    font-family: var(--font-mono);
    font-size: 10px;
    fill: var(--color-muted);
  }
  .tv-arch-end {
    font-weight: 600;
    fill: var(--color-body);
  }
  .tv-arch-gap,
  .tv-arch-scale-label,
  .tv-arch-sd-label {
    font-family: var(--font-mono);
    font-size: 9px;
    fill: var(--color-muted);
  }
  .tv-arch-orf-label {
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
  }
  .tv-arch-orf-sub {
    font-family: var(--font-sans);
    font-size: 9px;
    fill: var(--color-muted);
  }
</style>
