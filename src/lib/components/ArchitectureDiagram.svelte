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
  // D3 supplies the linear position scale and smooth path interpolation; the
  // biology-specific shapes live in small Svelte SVG components so the figure reads
  // more like a scientific illustration without moving any data geometry. A fixed
  // viewBox keeps the render deterministic for the visual-regression baselines.
  import { scaleLinear } from 'd3'
  import type { FuncClass, FuncSource, Member, Strand } from '../data/types'
  import { aaColor, FUNC_CLASS_SHADE } from '../color'
  import { fontFamily, neutral } from '../design/tokens'
  import { truncateToWidth } from '../text/measure'
  import { buildArchitecture, type ElementLayout, type FeatureBox } from '../architecture'
  import type { ArchitectureGlyphDims, Band } from '../architectureIllustration'
  import ArchitectureElementGlyph from './architecture/ArchitectureElementGlyph.svelte'
  import ArchitectureLegend from './architecture/ArchitectureLegend.svelte'

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
  const BREAK_X = TRACK_R + ORF_GAP * 0.42 // schematic-break (//) glyph x, before the ORF zone

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

  const glyphDims: ArchitectureGlyphDims = {
    yAa: Y_AA,
    yLoop: Y_LOOP,
    yBodyT: Y_BODY_T,
    bodyH: BODY_H,
    yBodyB: Y_BODY_B,
    yBodyMid: Y_BODY_MID,
    loopR: LOOP_R,
  }

  /** Pixel `{x, w}` of a feature box (min width so tiny features stay visible). */
  function band(box: FeatureBox, min = MIN_W): Band {
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

  // Downstream ORF fill — the muted func_class chrome colors (low-saturation, kept
  // clear of the specifier data palette; §8.2 chrome⟂data invariant). Shared with the
  // operon breakdown (S2.5) via `FUNC_CLASS_SHADE` in color.ts. Labels carry the class name.
  const orfFill = $derived(FUNC_CLASS_SHADE[funcClass])
  const orfDark = $derived(funcClass !== 'unknown' && funcClass !== 'transporter')

  // Downstream-gene sublabel, fitted to the ORF zone's pixel width with pretext so a
  // long gene name truncates on a grapheme boundary (no mid-word cut) instead of the
  // old fixed 22-char slice. The viewBox font is 9 units, so we measure at 9px and the
  // px width equals the width in viewBox units (~130 usable; reserve a little padding).
  const orfSubLabel = $derived(
    downstreamGene
      ? truncateToWidth(downstreamGene, `9px ${fontFamily.sans}`, 126)
      : 'downstream operon',
  )

  // Strand chevrons along the baseline — they point in the transcription direction,
  // which on this axis is always rightward (the axis IS biological 5′→3′).
  const CHEVRONS = 3
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

  // Faint engineering gridlines at scale-bar multiples — they anchor the to-scale claim
  // like graph paper without competing with the glyphs. Deterministic (function of span).
  const gridlines = $derived.by(() => {
    const xs: number[] = []
    for (let k = 1; x(scaleBp * k) < TRACK_R - 1; k++) xs.push(x(scaleBp * k))
    return xs
  })

</script>

<figure class="tv-arch w-full">
  <!-- On phones the dense diagram keeps a legible minimum width and scrolls
       horizontally rather than shrinking its labels to a few px; it fits the box
       normally once the container is wide enough. -->
  <div class="relative overflow-x-auto">
  <svg
    viewBox="0 0 {W} {H}"
    preserveAspectRatio="xMidYMid meet"
    class="w-full min-w-[34rem]"
    role="img"
    aria-label="Tandem architecture: {model.elements.length} T-box elements, biological 5′ to 3′, {strand} strand; downstream {funcClass} gene or operon."
  >
    <!-- Faint engineering gridlines at scale-bar multiples (graph-paper anchor) -->
    {#each gridlines as gx, i (i)}
      <line x1={gx} y1={Y_LOOP + 6} x2={gx} y2={Y_SCALE - 4} stroke={neutral.hairline} stroke-width="1" stroke-opacity="0.4" />
    {/each}

    <!-- Transcript backbone: a single faint hairline baseline (the data axis) -->
    <line
      x1={TRACK_L}
      y1={Y_BODY_MID}
      x2={orf.x0 - 4}
      y2={Y_BODY_MID}
      stroke={neutral.hairline}
      stroke-width="1"
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
          stroke-width="1"
          stroke-dasharray="3 3"
          class="tv-arch-spacer"
        />
        <!-- caliper end-ticks at each body edge -->
        <line x1={x(sp.start)} y1={Y_BODY_MID - 3} x2={x(sp.start)} y2={Y_BODY_MID + 3} stroke={neutral.muted} stroke-width="1" />
        <line x1={x(sp.end)} y1={Y_BODY_MID - 3} x2={x(sp.end)} y2={Y_BODY_MID + 3} stroke={neutral.muted} stroke-width="1" />
        <text x={(x(sp.start) + x(sp.end)) / 2} y={Y_GAP_LABEL} class="tv-arch-gap" text-anchor="middle">
          {sp.gap} bp
        </text>
      {/if}
    {/each}

    <!-- Elements (biological 5′→3′) -->
    {#each model.elements as el (el.member.member_id)}
      {@const tint = aaColor(el.aa)}
      {@const body = bodyRect(el)}
      <ArchitectureElementGlyph
        {el}
        {tint}
        {body}
        s1={el.features.s1 ? band(el.features.s1) : null}
        s1LoopX={el.features.s1_loop ? centre(el.features.s1_loop) : null}
        antiterm={el.features.antiterm ? band(el.features.antiterm) : null}
        termX={el.features.term ? centre(el.features.term) : null}
        discrimX={el.features.discrim ? centre(el.features.discrim) : null}
        codonX={el.features.codon ? centre(el.features.codon) : null}
        dims={glyphDims}
      />
    {/each}

    <!-- Schematic break (//) — honestly flags that the downstream ORF is NOT to scale -->
    <path
      d="M {BREAK_X - 2} {Y_BODY_MID + 4} L {BREAK_X + 2} {Y_BODY_MID - 4} M {BREAK_X + 3} {Y_BODY_MID + 4} L {BREAK_X + 7} {Y_BODY_MID - 4}"
      stroke={neutral.muted}
      stroke-width="1.1"
      stroke-linecap="round"
    />

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
        {orfSubLabel}
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
  </div>

  <figcaption class="mt-3 rounded-md border border-hairline bg-surface-subtle px-3 py-2.5">
    <ArchitectureLegend />
  </figcaption>
</figure>

<style>
  /* Text glyphs read tokens via classes; sizes are SVG-unit absolutes (the viewBox
     is fixed) so they scale with the diagram. Colors come from @theme tokens. */
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
  .tv-arch-scale-label {
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
