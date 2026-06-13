<script lang="ts">
  // One tandem element's overlay glyph (PLAN §9①). The element body is the hatchlings
  // LinearMap feature arrow (tinted by its specifier — the data-colour oracle); this
  // overlay adds only the calm chrome that rides on top: the specifier amino-acid chip
  // and the ordinal tag. The RNA-structure anatomy (Stem I, the specifier-codon tick,
  // the antiterminator bulge, the terminator hairpin / anti-SD, the discriminator) is no
  // longer drawn here — the figure is a clean operon overview, and the structural detail
  // lives in the R2DT secondary-structure viewer below. DOM hooks the tests rely on are
  // preserved: the `tv-arch-element` group + data-ordinal / data-aa, and the
  // `tv-arch-aa-chip` connector whose foot sits at the true specifier bp position.
  import type { ElementLayout } from '../../architecture'
  import { aaCodeColor } from '../../color'
  import { neutral } from '../../design/tokens'
  import type { ArchitectureGlyphDims, Band } from '../../architectureIllustration'

  let {
    el,
    tint,
    body,
    codonX = null,
    aaChipX = null,
    dims,
  }: {
    el: ElementLayout
    tint: string
    /** Element body band (the LinearMap arrow's extent); used to place the ordinal tag. */
    body: Band
    /** x of the specifier position on the body (the foot of the AA-chip connector). Null →
     *  the element has no specifier window, so no chip is drawn. */
    codonX?: number | null
    /** x of the AA chip label (collision-spread by the overlay). Defaults to `codonX` (no shift). */
    aaChipX?: number | null
    dims: ArchitectureGlyphDims
  } = $props()

  const bodyCx = $derived(body.x + body.w / 2)
  // On-hue specifier shade darkened to clear WCAG AA (≥4.5:1) on the white AA chip — keeps
  // even a pale specifier (GLY/VAL/MET) legible as the AA letters. NOT the body fill (the oracle).
  const deep = $derived(aaCodeColor(tint))
</script>

<g class="tv-arch-element" data-ordinal={el.ordinal} data-aa={el.aa ?? '?'}>
  <!-- Specifier amino-acid chip: a small pill above the element, joined by a short connector
       to the specifier position on the body. The chip x is collision-spread by the overlay so
       two close elements never overlap; the connector foot stays at the true `codonX` bp
       position (the bp→x alignment oracle the tests pin). The AA letters carry the specifier
       hue (the headline datum). -->
  {#if codonX !== null}
    {@const chipX = aaChipX ?? codonX}
    <g class="tv-arch-aa-chip">
      <line
        class="tv-arch-aa-connector"
        x1={chipX}
        y1={dims.yAa + 4}
        x2={codonX}
        y2={dims.yBodyT - 2}
        stroke={tint}
        stroke-width="1"
        stroke-opacity="0.55"
        stroke-linecap="round"
      />
      <rect
        x={chipX - 13}
        y={dims.yAa - 11.5}
        width="26"
        height="15"
        rx="2"
        fill={neutral.surface}
        stroke={tint}
        stroke-width="1"
      />
      <text x={chipX} y={dims.yAa} class="tv-arch-aa" text-anchor="middle" fill={deep}>{el.aa ?? '?'}</text>
    </g>
  {/if}

  <!-- Ordinal tag under the body. -->
  <text x={bodyCx} y={dims.yBodyB + 14} class="tv-arch-ord" text-anchor="middle">
    {el.ordinal}
  </text>
</g>

<style>
  .tv-arch-aa {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
  }
  .tv-arch-ord {
    font-family: var(--font-mono);
    font-size: 10px;
    fill: var(--color-muted);
  }
</style>
