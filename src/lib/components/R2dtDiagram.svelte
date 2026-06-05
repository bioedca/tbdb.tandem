<script lang="ts">
  // R2DT secondary-structure diagram (PLAN §9) — the canonical RF00230 / T-box
  // template layout, the deterministic complement to fornac's force render. Pure
  // presentational SVG: given a member's committed R2DT diagram (coords + base
  // pairs, from public/data/r2dt/) and its stem spans, it draws base-pair rungs, a
  // backbone, and one nucleotide per residue COLORED by structural domain via the
  // shared color.ts `buildStemColorMap` — the exact same palette the fornac overlay
  // uses, so the two viewers color identically. No layout math beyond fitting the
  // committed coordinates to the box (R2DT already placed every nucleotide).
  import type { MemberStem } from '../data/types'
  import type { R2dtDiagram } from '../r2dt'
  import { diagramViewBox, nucleotideSpacing } from '../r2dt'
  import { buildStemColorMap, STEM_LINKER_COLOR } from '../color'

  let { diagram, stems }: { diagram: R2dtDiagram; stems: MemberStem[] } = $props()

  const n = $derived(diagram.seq.length)
  const colorAt = $derived(buildStemColorMap(stems, n))
  const viewBox = $derived(diagramViewBox(diagram))
  const spacing = $derived(nucleotideSpacing(diagram))

  // Glyph/stroke scale derived from the template's own nucleotide spacing so the
  // diagram reads at any molecule length.
  const r = $derived(spacing * 0.44)
  const fontSize = $derived(spacing * 0.62)
  const stroke = $derived(Math.max(0.4, spacing * 0.08))

  // Backbone segments between consecutive nucleotides, skipping the rare long
  // template jumps (so the chain reads without a diagonal slashing across the map).
  const backbone = $derived.by(() => {
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = []
    const maxStep = spacing * 2.2
    for (let i = 1; i < n; i++) {
      const dx = diagram.x[i] - diagram.x[i - 1]
      const dy = diagram.y[i] - diagram.y[i - 1]
      if (Math.hypot(dx, dy) <= maxStep) {
        segs.push({ x1: diagram.x[i - 1], y1: diagram.y[i - 1], x2: diagram.x[i], y2: diagram.y[i] })
      }
    }
    return segs
  })

  // A readable label: letters only when the fitted glyphs won't be vanishingly
  // small (long molecules rely on color + shape; tiny letters just add noise).
  const showLetters = $derived(n <= 360)
</script>

<svg
  class="h-full w-full"
  viewBox={viewBox.join(' ')}
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label="RNA secondary structure (R2DT, canonical T-box template)"
>
  <!-- backbone (faint) -->
  <g stroke={STEM_LINKER_COLOR} stroke-width={stroke} stroke-linecap="round" opacity="0.6">
    {#each backbone as s (s.x1 + ',' + s.y1)}
      <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
    {/each}
  </g>

  <!-- base-pair rungs -->
  <g stroke="#9aa6ad" stroke-width={stroke * 1.1} stroke-linecap="round">
    {#each diagram.pairs as [i, j] (i + '-' + j)}
      <line x1={diagram.x[i - 1]} y1={diagram.y[i - 1]} x2={diagram.x[j - 1]} y2={diagram.y[j - 1]} />
    {/each}
  </g>

  <!-- nucleotides, colored by structural domain -->
  <g>
    {#each diagram.seq as base, idx (idx)}
      <circle
        cx={diagram.x[idx]}
        cy={diagram.y[idx]}
        {r}
        fill={colorAt[idx + 1]}
        stroke="rgba(15,23,42,0.16)"
        stroke-width={stroke * 0.6}
      />
      {#if showLetters}
        <text
          x={diagram.x[idx]}
          y={diagram.y[idx]}
          font-size={fontSize}
          text-anchor="middle"
          dominant-baseline="central"
          fill="#1f2937"
          style="font-family: var(--font-mono); pointer-events: none;">{base}</text
        >
      {/if}
    {/each}
  </g>
</svg>
