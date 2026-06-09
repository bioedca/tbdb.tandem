<script lang="ts">
  import { scaleLinear } from 'd3'
  import { Html, LayerCake, Svg } from 'layercake'
  import type { FuncClass, FuncSource, Member, Strand } from '../data/types'
  import { buildArchitecturePoster } from '../architecturePoster'
  import { safeSvgId } from '../architectureIllustration'
  import ArchitecturePosterSvgLayer from './architecture/ArchitecturePosterSvgLayer.svelte'
  import ArchitecturePosterHtmlLayer from './architecture/ArchitecturePosterHtmlLayer.svelte'

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

  let activeId = $state<string | null>(null)
  const poster = $derived(buildArchitecturePoster(members, strand, { funcClass, funcSource, downstreamGene }))
  const descId = $derived(safeSvgId(poster.locusId, 'tv-arch-poster-desc'))
  const titleText = $derived(
    `Illustrated tandem architecture for ${poster.locusId}: ${poster.elementNodes.length} T-box elements in biological 5' to 3' order.`,
  )

  $effect(() => {
    if (activeId && !poster.nodes.some((node) => node.id === activeId)) activeId = null
  })

  function setActive(id: string | null): void {
    activeId = id
  }

  function xRange({ width }: { width: number }): [number, number] {
    return [42, Math.max(width - 42, 64)]
  }

  function yRange({ height }: { height: number }): [number, number] {
    return [0, Math.max(height, 1)]
  }
</script>

<figure class="tv-arch-poster w-full" aria-describedby={descId}>
  <p id={descId} class="sr-only">
    Illustrated architecture view for {poster.locusId}. The layout is normalized for readability
    and is not drawn to genomic scale. The order, direction, spacer or overlap labels, element
    annotations, and downstream coding-region relationship come from the same architecture model
    as the accurate view.
  </p>

  <div class="tv-arch-poster-scroll overflow-x-auto">
    <div class="tv-arch-poster-stage">
      <LayerCake
        ssr
        x="x"
        y="y"
        data={poster.nodes}
        flatData={poster.nodes}
        xDomain={[0, poster.xMax]}
        yDomain={[0, 100]}
        yReverse={false}
        xScale={scaleLinear()}
        yScale={scaleLinear()}
        {xRange}
        {yRange}
      >
        <Svg
          label={titleText}
          describedBy={descId}
          titleText={titleText}
          overflow="hidden"
        >
          <ArchitecturePosterSvgLayer {poster} {activeId} {setActive} />
        </Svg>
        <Html pointerEvents label="Architecture figure callouts" describedBy={descId}>
          <ArchitecturePosterHtmlLayer {poster} {activeId} {setActive} />
        </Html>
      </LayerCake>
    </div>
  </div>

  <figcaption class="mt-2 border-t border-hairline pt-2.5 text-small text-muted">
    Illustrated figure layout: horizontal order and annotations are preserved, while spacing is
    normalized for comparison and presentation. Use Accurate for the to-scale genomic view.
  </figcaption>
</figure>

<style>
  .tv-arch-poster-stage {
    position: relative;
    min-width: 42rem;
    height: clamp(23rem, 44vw, 34rem);
    overflow: hidden;
    border: 1px solid var(--color-hairline);
    border-radius: 10px;
    background: var(--color-surface);
  }
  :global(.tv-arch-poster-stage .layercake-container) {
    width: 100%;
    height: 100%;
  }
</style>
