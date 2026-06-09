<script lang="ts">
  import { getContext } from 'svelte'
  import type { Readable } from 'svelte/store'
  import { aaColor, FUNC_CLASS_SHADE, withAlpha } from '../../color'
  import { brand, neutral } from '../../design/tokens'
  import type { ArchitectureGlyphDims, Band } from '../../architectureIllustration'
  import { safeSvgId } from '../../architectureIllustration'
  import type {
    ArchitecturePosterEdge,
    ArchitecturePosterModel,
    ArchitecturePosterNode,
  } from '../../architecturePoster'
  import type { ElementLayout, FeatureBox } from '../../architecture'
  import ArchitectureElementGlyph from './ArchitectureElementGlyph.svelte'

  type Scale = (value: number) => number
  interface LayerCakeContext {
    width: Readable<number>
    height: Readable<number>
    xScale: Readable<Scale>
    yScale: Readable<Scale>
  }

  let {
    poster,
    activeId = null,
    setActive = () => {},
  }: {
    poster: ArchitecturePosterModel
    activeId?: string | null
    setActive?: (id: string | null) => void
  } = $props()

  const { width, height, xScale, yScale } = getContext<LayerCakeContext>('LayerCake')
  const nodesById = $derived(new Map(poster.nodes.map((node) => [node.id, node])))
  const arrowId = $derived(safeSvgId(poster.locusId, 'tv-arch-poster-arrow'))
  const glowId = $derived(safeSvgId(poster.locusId, 'tv-arch-poster-glow'))

  const CARD_H = 126
  const BODY_PAD_X = 22
  const glyphDims: ArchitectureGlyphDims = {
    yAa: 20,
    yLoop: 44,
    yBodyT: 62,
    bodyH: 28,
    yBodyB: 90,
    yBodyMid: 76,
    loopR: 6,
  }

  function sx(value: number): number {
    return $xScale(value)
  }

  function sy(value: number): number {
    return $yScale(value)
  }

  function cardW(): number {
    const available = Math.max($width - 128, 160)
    return Math.min(226, Math.max(148, available / Math.max(poster.elementNodes.length + 1.15, 2.5)))
  }

  function body(el: ElementLayout, widthPx: number): Band {
    void el
    return { x: BODY_PAD_X, w: Math.max(widthPx - BODY_PAD_X * 2, 68) }
  }

  function bodyScale(el: ElementLayout, widthPx: number, value: number): number {
    const b = body(el, widthPx)
    const span = Math.max(el.bodyEnd - el.bodyStart, 1)
    const frac = (value - el.bodyStart) / span
    const raw = b.x + frac * b.w
    return Math.max(b.x - 7, Math.min(b.x + b.w + 7, raw))
  }

  function band(el: ElementLayout, box: FeatureBox, widthPx: number, min = 3): Band {
    const a = bodyScale(el, widthPx, box.start)
    const b = bodyScale(el, widthPx, box.end)
    return { x: Math.min(a, b), w: Math.max(Math.abs(b - a), min) }
  }

  function centre(el: ElementLayout, box: FeatureBox, widthPx: number): number {
    return (bodyScale(el, widthPx, box.start) + bodyScale(el, widthPx, box.end)) / 2
  }

  function nodeX(node: ArchitecturePosterNode): number {
    return sx(node.x)
  }

  function nodeY(node: ArchitecturePosterNode): number {
    return sy(node.y)
  }

  function edgeNodes(edge: ArchitecturePosterEdge): [ArchitecturePosterNode, ArchitecturePosterNode] | null {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    return source && target ? [source, target] : null
  }

  function relationshipPath(edge: ArchitecturePosterEdge, index: number): string {
    const pair = edgeNodes(edge)
    if (!pair) return ''
    const [source, target] = pair
    const x0 = nodeX(source)
    const x1 = nodeX(target)
    const base = sy(63)
    const span = Math.max(Math.abs(x1 - x0), 40)
    const lift = edge.kind === 'overlap' ? -30 - index * 5 : 24 + index * 4
    const c = base + lift
    return `M ${x0} ${base} C ${x0 + span * 0.24} ${c}, ${x1 - span * 0.24} ${c}, ${x1} ${base}`
  }

  function relationshipLabel(edge: ArchitecturePosterEdge, index: number): { x: number; y: number } {
    const pair = edgeNodes(edge)
    if (!pair) return { x: 0, y: 0 }
    const [source, target] = pair
    const y = sy(63) + (edge.kind === 'overlap' ? -36 - index * 5 : 34 + index * 4)
    return { x: (nodeX(source) + nodeX(target)) / 2, y }
  }

  function orfPoints(node: ArchitecturePosterNode): string {
    const x = nodeX(node)
    const y = nodeY(node)
    const w = Math.min(170, Math.max(112, cardW() * 0.78))
    const h = 34
    const tip = 18
    const x0 = x - w / 2
    const x1 = x + w / 2
    return `${x0},${y - h / 2} ${x1 - tip},${y - h / 2} ${x1},${y} ${x1 - tip},${y + h / 2} ${x0},${y + h / 2}`
  }

  function elementLabel(node: ArchitecturePosterNode): string {
    const el = node.glyphData
    if (!el) return node.label
    const aa = el.member.specifier.aa ?? 'unknown specifier'
    const codon = el.member.specifier.codon ? ` codon ${el.member.specifier.codon}` : ''
    return `Element ${el.ordinal}, ${aa}${codon}, ${el.member.type ?? 'regulation mode unknown'}`
  }

  function onKey(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setActive(activeId === id ? null : id)
    } else if (event.key === 'Escape') {
      setActive(null)
    }
  }
</script>

<defs>
  <marker
    id={arrowId}
    viewBox="0 0 10 10"
    refX="8.5"
    refY="5"
    markerWidth="8"
    markerHeight="8"
    orient="auto-start-reverse"
  >
    <path d="M 0 0 L 10 5 L 0 10 z" fill={brand.accent} />
  </marker>
  <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.14" />
  </filter>
</defs>

<!-- soft figure bands -->
<rect x="0" y="0" width={$width} height={$height} rx="10" fill={neutral.surface} />
<path
  d="M 0 {sy(29)} C {$width * 0.24} {sy(18)}, {$width * 0.72} {sy(36)}, {$width} {sy(22)} L {$width} 0 L 0 0 z"
  fill={brand.accentSubtle}
  opacity="0.8"
/>
<line
  x1={sx(0.34)}
  y1={sy(63)}
  x2={sx(poster.orfNode.x + 0.42)}
  y2={sy(63)}
  stroke={withAlpha(brand.accent, 0.32)}
  stroke-width="10"
  stroke-linecap="round"
/>
<line
  x1={sx(0.34)}
  y1={sy(63)}
  x2={sx(poster.orfNode.x + 0.42)}
  y2={sy(63)}
  stroke={brand.accent}
  stroke-width="1.7"
  stroke-linecap="round"
  marker-end="url(#{arrowId})"
/>
<text x={sx(0.24)} y={sy(63) + 25} class="tv-poster-axis" text-anchor="middle">5′</text>
<text x={sx(poster.orfNode.x + 0.48)} y={sy(63) + 25} class="tv-poster-axis" text-anchor="middle">3′</text>

<!-- spacer / overlap relationships retain the signed relationships from buildArchitecture() -->
{#each poster.relationships as edge, i (edge.id)}
  {@const label = relationshipLabel(edge, i)}
  <path
    class="tv-poster-relationship"
    data-kind={edge.kind}
    d={relationshipPath(edge, i)}
    fill="none"
    stroke={edge.kind === 'overlap' ? '#8a5285' : brand.accent}
    stroke-width={1.4 + (edge.strength ?? 0.2) * 4}
    stroke-linecap="round"
    opacity={activeId === null || activeId === edge.source || activeId === edge.target ? 0.78 : 0.24}
  />
  <text x={label.x} y={label.y} class="tv-poster-edge-label" text-anchor="middle">
    {edge.label}
  </text>
{/each}

<!-- element glyph cards -->
{#each poster.elementNodes as node (node.id)}
  {@const el = node.glyphData!}
  {@const w = cardW()}
  {@const x = nodeX(node)}
  {@const y = nodeY(node)}
  {@const tint = aaColor(el.aa)}
  <g
    class="tv-arch-poster-card"
    data-active={activeId === node.id}
    data-ordinal={el.ordinal}
    role="button"
    tabindex="0"
    aria-label={elementLabel(node)}
    aria-pressed={activeId === node.id}
    transform="translate({x - w / 2} {y - CARD_H / 2})"
    onmouseenter={() => setActive(node.id)}
    onmouseleave={() => setActive(null)}
    onfocus={() => setActive(node.id)}
    onblur={() => setActive(null)}
    onkeydown={(event) => onKey(event, node.id)}
  >
    <title>{elementLabel(node)}</title>
    <rect
      class="tv-poster-card-bg"
      x="0"
      y="0"
      width={w}
      height={CARD_H}
      rx="8"
      fill={neutral.surface}
      stroke={activeId === node.id ? tint : neutral.hairline}
      stroke-width={activeId === node.id ? 2.2 : 1}
      filter={activeId === node.id ? `url(#${glowId})` : undefined}
    />
    <text x="12" y="18" class="tv-poster-card-title">Element {el.ordinal}</text>
    <text x={w - 12} y="18" class="tv-poster-card-type" text-anchor="end">{el.member.type ?? 'mode ?'}</text>
    <ArchitectureElementGlyph
      {el}
      {tint}
      body={body(el, w)}
      s1={el.features.s1 ? band(el, el.features.s1, w) : null}
      s1LoopX={el.features.s1_loop ? centre(el, el.features.s1_loop, w) : null}
      antiterm={el.features.antiterm ? band(el, el.features.antiterm, w) : null}
      termX={el.features.term ? centre(el, el.features.term, w) : null}
      discrimX={el.features.discrim ? centre(el, el.features.discrim, w) : null}
      codonX={el.features.codon ? centre(el, el.features.codon, w) : null}
      dims={glyphDims}
    />
  </g>
{/each}

<!-- downstream coding-region relationship, schematic but visually attached to 3' end -->
<g class="tv-arch-poster-orf" data-func={poster.orfNode.metadata?.funcClass}>
  <polygon
    points={orfPoints(poster.orfNode)}
    fill={FUNC_CLASS_SHADE[(poster.orfNode.metadata?.funcClass as keyof typeof FUNC_CLASS_SHADE) ?? 'unknown']}
    stroke={neutral.muted}
    stroke-width="1"
  />
  <text
    x={nodeX(poster.orfNode)}
    y={nodeY(poster.orfNode) + 4}
    class="tv-poster-orf-label"
    text-anchor="middle"
    fill={poster.orfNode.label === 'transporter' || poster.orfNode.label === 'unknown' ? neutral.ink : '#ffffff'}
  >
    {poster.orfNode.label}{#if poster.orfNode.metadata?.funcSource === 'text'}*{/if}
  </text>
</g>

<style>
  .tv-poster-axis,
  .tv-poster-edge-label,
  .tv-poster-card-title,
  .tv-poster-card-type,
  .tv-poster-orf-label {
    font-family: var(--font-sans);
  }
  .tv-poster-axis {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    fill: var(--color-brand);
  }
  .tv-poster-edge-label {
    font-size: 11px;
    font-weight: 600;
    fill: var(--color-muted);
    paint-order: stroke;
    stroke: var(--color-surface);
    stroke-width: 4px;
    stroke-linejoin: round;
  }
  .tv-poster-card-title {
    font-size: 11px;
    font-weight: 700;
    fill: var(--color-ink);
  }
  .tv-poster-card-type {
    font-size: 9px;
    fill: var(--color-muted);
  }
  .tv-poster-relationship {
    transition: opacity 150ms var(--ease-standard), stroke-width 150ms var(--ease-standard);
  }
  .tv-arch-poster-card {
    cursor: default;
    transition: opacity 150ms var(--ease-standard);
  }
  .tv-arch-poster-card[data-active='false'] {
    opacity: 0.92;
  }
  .tv-poster-card-bg {
    transition: stroke 150ms var(--ease-standard), stroke-width 150ms var(--ease-standard);
  }
  .tv-poster-orf-label {
    font-size: 11px;
    font-weight: 700;
  }
</style>
