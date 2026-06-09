<script lang="ts">
  // One tandem element, drawn as a clean engraved line-figure (PLAN §9①). Every glyph
  // is a single-weight deterministic shape in its own lane so the element reads like a
  // methods-paper plate, not a sketch. DOM hooks the tests rely on are preserved
  // verbatim: the `tv-arch-element` group + data-ordinal/data-aa; one `[data-feature]`
  // per feature (s1, s1_loop, codon, antiterm, term, discrim); the `tv-arch-body` rect
  // whose `fill` IS the specifier colour (the data-colour oracle — do not change it);
  // and the `tv-arch-term-hairpin` / `tv-arch-term-sd` conformation split.
  import type { ElementLayout } from '../../architecture'
  import { aaCodeColor } from '../../color'
  import { neutral } from '../../design/tokens'
  import {
    bulge,
    hairpin,
    ladderRails,
    ladderRungs,
    type ArchitectureGlyphDims,
    type Band,
  } from '../../architectureIllustration'

  let {
    el,
    tint,
    body,
    s1 = null,
    s1LoopX = null,
    antiterm = null,
    termX = null,
    discrimX = null,
    codonX = null,
    dims,
  }: {
    el: ElementLayout
    tint: string
    body: Band
    s1?: Band | null
    s1LoopX?: number | null
    antiterm?: Band | null
    termX?: number | null
    discrimX?: number | null
    codonX?: number | null
    dims: ArchitectureGlyphDims
  } = $props()

  const bodyCx = $derived(body.x + body.w / 2)
  // On-hue specifier shade darkened to clear WCAG AA (≥4.5:1) on the white codon chip —
  // keeps even a pale specifier (GLY/VAL/MET) legible as the AA letters + the Stem-I loop
  // outline without leaving the data hue family. NOT used for the body fill (the oracle).
  const deep = $derived(aaCodeColor(tint))

  // Stem-I ladder rails sit in the upper third of the body (the structured 5′ region).
  const railTop = $derived(dims.yBodyT + 6)
  const railBot = $derived(dims.yBodyT + 13)
</script>

<g class="tv-arch-element" data-ordinal={el.ordinal} data-aa={el.aa ?? '?'}>
  <!-- Element body (the T-box), tinted by its OWN specifier (mixed loci read two-tone).
       fill/stroke ARE the data-colour oracle the tests read — keep them the tint. The
       engineered look comes from a flat tint fill + a 1px inset white top-bevel, not a
       glossy gradient. -->
  <rect
    class="tv-arch-body"
    x={body.x}
    y={dims.yBodyT}
    width={body.w}
    height={dims.bodyH}
    rx="4"
    fill={tint}
    fill-opacity="0.1"
    stroke={tint}
    stroke-width="1.5"
  />
  <line
    class="tv-arch-body-bevel"
    x1={body.x + 2}
    y1={dims.yBodyT + 1.25}
    x2={body.x + body.w - 2}
    y2={dims.yBodyT + 1.25}
    stroke="#ffffff"
    stroke-width="1"
    stroke-opacity="0.5"
    pointer-events="none"
  />

  <!-- Stem I: a two-rail base-pair ladder (the duplex), tinted. -->
  {#if s1}
    {@const rails = ladderRails(s1)}
    {@const rungs = ladderRungs(s1, railTop, railBot)}
    <g class="tv-arch-feature tv-arch-stem1" data-feature="s1">
      <line x1={rails.x0} y1={railTop} x2={rails.x1} y2={railTop} stroke={tint} stroke-width="1.1" stroke-linecap="round" />
      <line x1={rails.x0} y1={railBot} x2={rails.x1} y2={railBot} stroke={tint} stroke-width="1.1" stroke-linecap="round" />
      {#each rungs as r, i (i)}
        <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={tint} stroke-width="0.8" stroke-opacity="0.7" />
      {/each}
    </g>
  {/if}

  <!-- Stem I terminal loop: a clean lollipop rising above the body. -->
  {#if s1LoopX !== null}
    <g class="tv-arch-feature tv-arch-stem1-loop" data-feature="s1_loop">
      <line
        x1={s1LoopX}
        y1={dims.yBodyT}
        x2={s1LoopX}
        y2={dims.yLoop + dims.loopR}
        stroke={tint}
        stroke-width="1.2"
        stroke-linecap="round"
      />
      <circle cx={s1LoopX} cy={dims.yLoop} r={dims.loopR} fill="none" stroke={deep} stroke-width="1.5" />
    </g>
  {/if}

  <!-- Antiterminator: the alternative fold, a low dashed two-strand bulge below the body. -->
  {#if antiterm}
    {@const b = bulge(antiterm, dims.yBodyB + 1, 6)}
    <g class="tv-arch-feature tv-arch-antiterm" data-feature="antiterm">
      <path d={b.outer} fill="none" stroke={neutral.muted} stroke-width="1.1" stroke-dasharray="2.2 1.8" stroke-linecap="round" />
      <path d={b.inner} fill="none" stroke={neutral.muted} stroke-width="0.8" stroke-opacity="0.6" stroke-linecap="round" />
    </g>
  {/if}

  <!-- Terminator hairpin (Transcriptional) / anti-SD sequestrator (Translational). -->
  {#if termX !== null}
    {#if el.member.type === 'Translational'}
      {@const hp = hairpin(termX, dims.yBodyT, 15, 5, 2)}
      <g class="tv-arch-feature tv-arch-term tv-arch-term-sd" data-feature="term">
        <title
          >Translational element: the sequestrator hairpin occludes the Shine-Dalgarno ribosome-binding site (SD/RBS) when the cognate tRNA is charged, blocking translation initiation. Drawn schematically: no SD coordinate is stored.</title
        >
        <path d={hp.strands} fill="none" stroke={neutral.ink} stroke-width="1.3" stroke-dasharray="2.2 1.6" stroke-linecap="round" />
        <path d={hp.loop} fill="none" stroke={neutral.ink} stroke-width="1.3" stroke-dasharray="2.2 1.6" stroke-linecap="round" />
        <text x={termX} y={hp.apexY - 5} class="tv-arch-sd-label" text-anchor="middle">SD/RBS</text>
      </g>
    {:else}
      {@const hp = hairpin(termX, dims.yBodyT, 28, 6, 3)}
      <g class="tv-arch-feature tv-arch-term tv-arch-term-hairpin" data-feature="term">
        <path d={hp.strands} fill="none" stroke={neutral.ink} stroke-width="1.5" stroke-linecap="round" />
        <path d={hp.loop} fill="none" stroke={neutral.ink} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        {#each hp.rungs as r, i (i)}
          <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={neutral.ink} stroke-width="0.7" stroke-opacity="0.7" />
        {/each}
      </g>
    {/if}
  {/if}

  <!-- Discriminator: a small open ring on the body baseline (a position mark). -->
  {#if discrimX !== null}
    <circle
      class="tv-arch-feature tv-arch-discrim"
      data-feature="discrim"
      cx={discrimX}
      cy={dims.yBodyB}
      r="2.5"
      fill={neutral.surface}
      stroke={neutral.muted}
      stroke-width="1"
    />
  {/if}

  <!-- Specifier codon: an ink registration tick (serif feet) through the body, with the
       AA code in a squared chip above, connected to its codon position. The AA letters
       carry the specifier colour — the one place the data hue appears loud, since the
       specifier IS the headline datum. -->
  {#if codonX !== null}
    <g class="tv-arch-feature tv-arch-codon" data-feature="codon">
      <line x1={codonX} y1={dims.yBodyT - 2} x2={codonX} y2={dims.yBodyB + 2} stroke={neutral.ink} stroke-width="1.6" />
      <line x1={codonX - 2.5} y1={dims.yBodyT - 2} x2={codonX + 2.5} y2={dims.yBodyT - 2} stroke={neutral.ink} stroke-width="1.6" stroke-linecap="round" />
      <line x1={codonX - 2.5} y1={dims.yBodyB + 2} x2={codonX + 2.5} y2={dims.yBodyB + 2} stroke={neutral.ink} stroke-width="1.6" stroke-linecap="round" />
      <line x1={codonX} y1={dims.yAa + 4} x2={codonX} y2={dims.yBodyT - 2} stroke={tint} stroke-width="1" stroke-opacity="0.55" />
      <rect
        x={codonX - 13}
        y={dims.yAa - 11.5}
        width="26"
        height="15"
        rx="2"
        fill={neutral.surface}
        stroke={tint}
        stroke-width="1"
      />
      <text x={codonX} y={dims.yAa} class="tv-arch-aa" text-anchor="middle" fill={deep}>{el.aa ?? '?'}</text>
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
  .tv-arch-sd-label {
    font-family: var(--font-mono);
    font-size: 8.5px;
    fill: var(--color-muted);
  }
</style>
