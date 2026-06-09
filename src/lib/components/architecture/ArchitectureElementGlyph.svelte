<script lang="ts">
  import type { ElementLayout } from '../../architecture'
  import { neutral } from '../../design/tokens'
  import {
    hairpinRungs,
    safeSvgId,
    sequestratorPath,
    stemLoopPath,
    stemRungs,
    terminatorHairpinPath,
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

  const gradientId = $derived(safeSvgId(el.member.member_id, 'tv-arch-body-grad'))
  const bodyCx = $derived(body.x + body.w / 2)
  const bodyPad = $derived(Math.min(7, Math.max(2, body.w * 0.08)))
</script>

<g class="tv-arch-element" data-ordinal={el.ordinal} data-aa={el.aa ?? '?'}>
  <defs>
    <linearGradient id={gradientId} x1="0" y1={dims.yBodyT} x2="0" y2={dims.yBodyB} gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.72" />
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.18" />
      <stop offset="1" stop-color={tint} stop-opacity="0.16" />
    </linearGradient>
  </defs>

  <!-- Element body (the T-box), tinted by its OWN specifier. The extra highlight
       layer gives the body a polished scientific-figure treatment while preserving
       the original fill/stroke attributes the tests use as a data-colour oracle. -->
  <rect
    class="tv-arch-body"
    x={body.x}
    y={dims.yBodyT}
    width={body.w}
    height={dims.bodyH}
    rx="5"
    fill={tint}
    fill-opacity="0.14"
    stroke={tint}
    stroke-width="1.8"
  />
  <rect
    class="tv-arch-body-highlight"
    x={body.x + 0.8}
    y={dims.yBodyT + 0.8}
    width={Math.max(body.w - 1.6, 1)}
    height={dims.bodyH - 1.6}
    rx="4.2"
    fill="url(#{gradientId})"
    pointer-events="none"
  />
  <line
    class="tv-arch-element-backbone"
    x1={body.x + bodyPad}
    y1={dims.yBodyMid}
    x2={body.x + body.w - bodyPad}
    y2={dims.yBodyMid}
    stroke={tint}
    stroke-width="1.2"
    stroke-opacity="0.5"
    stroke-linecap="round"
  />

  <!-- Stem I: translucent helix block plus small base-pair rungs. -->
  {#if s1}
    {@const rungs = stemRungs(s1, dims.yBodyT + 5.5, dims.yBodyT + 12)}
    <g class="tv-arch-feature tv-arch-stem1" data-feature="s1">
      <rect
        x={s1.x}
        y={dims.yBodyT + 3.5}
        width={s1.w}
        height="11"
        rx="5.5"
        fill={tint}
        fill-opacity="0.26"
        stroke={tint}
        stroke-width="0.9"
      />
      <line
        x1={s1.x + 2}
        y1={dims.yBodyT + 5.3}
        x2={s1.x + s1.w - 2}
        y2={dims.yBodyT + 12.2}
        stroke={tint}
        stroke-width="0.9"
        stroke-opacity="0.58"
        stroke-linecap="round"
      />
      {#each rungs as r, i (i)}
        <line
          x1={r.x1}
          y1={r.y1}
          x2={r.x2}
          y2={r.y2}
          stroke={tint}
          stroke-width="0.7"
          stroke-opacity="0.72"
          stroke-linecap="round"
        />
      {/each}
    </g>
  {/if}

  <!-- Stem I terminal loop. -->
  {#if s1LoopX !== null}
    <g class="tv-arch-feature tv-arch-stem1-loop" data-feature="s1_loop">
      <line
        x1={s1LoopX}
        y1={dims.yBodyT + 3.5}
        x2={s1LoopX}
        y2={dims.yLoop + dims.loopR * 0.82}
        stroke={tint}
        stroke-width="1.25"
        stroke-linecap="round"
      />
      <path
        d={stemLoopPath(s1LoopX, dims.yLoop, dims.loopR)}
        fill="none"
        stroke={tint}
        stroke-width="1.65"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx={s1LoopX + dims.loopR * 0.62} cy={dims.yLoop + dims.loopR * 0.7} r="1.2" fill={tint} opacity="0.7" />
    </g>
  {/if}

  <!-- Antiterminator: outline only, held below the element backbone. -->
  {#if antiterm}
    <g class="tv-arch-feature tv-arch-antiterm" data-feature="antiterm">
      <rect
        x={antiterm.x}
        y={dims.yBodyMid + 2}
        width={antiterm.w}
        height={dims.yBodyB - (dims.yBodyMid + 2) - 2}
        rx="5"
        fill="none"
        stroke={neutral.muted}
        stroke-width="1.25"
        stroke-dasharray="2.2 1.8"
      />
      <path
        d="M {antiterm.x + 3} {dims.yBodyMid + 6} C {bodyCx - 4} {dims.yBodyB - 4}, {bodyCx + 4} {dims.yBodyB - 4}, {antiterm.x + antiterm.w - 3} {dims.yBodyMid + 6}"
        fill="none"
        stroke={neutral.muted}
        stroke-width="0.75"
        stroke-opacity="0.55"
      />
    </g>
  {/if}

  <!-- Terminator hairpin (Transcriptional) / anti-SD sequestrator (Translational). -->
  {#if termX !== null}
    {#if el.member.type === 'Translational'}
      <g class="tv-arch-feature tv-arch-term tv-arch-term-sd" data-feature="term">
        <title>Translational element: the sequestrator hairpin occludes the Shine-Dalgarno ribosome-binding site (SD/RBS) when the cognate tRNA is charged, blocking translation initiation. Drawn schematically: no SD coordinate is stored.</title>
        <path
          d={sequestratorPath(termX, dims.yBodyT - 3)}
          fill="none"
          stroke={neutral.ink}
          stroke-width="1.45"
          stroke-dasharray="2.2 1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <text x={termX} y={dims.yBodyT - 18} class="tv-arch-sd-label" text-anchor="middle">SD/RBS</text>
      </g>
    {:else}
      {@const rungs = hairpinRungs(termX, dims.yBodyT)}
      <g class="tv-arch-feature tv-arch-term tv-arch-term-hairpin" data-feature="term">
        <path
          d={terminatorHairpinPath(termX, dims.yBodyT)}
          fill="none"
          stroke={neutral.ink}
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        {#each rungs as r, i (i)}
          <line
            x1={r.x1}
            y1={r.y1}
            x2={r.x2}
            y2={r.y2}
            stroke={neutral.ink}
            stroke-width="0.75"
            stroke-opacity="0.7"
            stroke-linecap="round"
          />
        {/each}
      </g>
    {/if}
  {/if}

  <!-- Discriminator: small diamond at the body baseline. -->
  {#if discrimX !== null}
    <path
      class="tv-arch-feature tv-arch-discrim"
      data-feature="discrim"
      d="M {discrimX} {dims.yBodyB - 4} l 3.2 3.2 l -3.2 3.2 l -3.2 -3.2 z"
      fill={neutral.muted}
    />
  {/if}

  <!-- Specifier codon: bold tick through the body + AA code above. -->
  {#if codonX !== null}
    <g class="tv-arch-feature tv-arch-codon" data-feature="codon">
      <line
        x1={codonX}
        y1={dims.yBodyT - 2}
        x2={codonX}
        y2={dims.yBodyB + 2}
        stroke={neutral.ink}
        stroke-width="2.5"
        stroke-linecap="round"
      />
      <rect
        x={codonX - 13}
        y={dims.yAa - 11.5}
        width="26"
        height="15"
        rx="4"
        fill={neutral.surface}
        stroke={tint}
        stroke-width="0.9"
        stroke-opacity="0.65"
      />
      <text x={codonX} y={dims.yAa} class="tv-arch-aa" text-anchor="middle" fill={tint}>{el.aa ?? '?'}</text>
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
    font-size: 9px;
    fill: var(--color-muted);
  }
</style>
