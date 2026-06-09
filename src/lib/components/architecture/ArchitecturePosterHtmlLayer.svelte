<script lang="ts">
  import { getContext } from 'svelte'
  import type { Readable } from 'svelte/store'
  import { aaColor } from '../../color'
  import type { ArchitecturePosterModel, ArchitecturePosterNode } from '../../architecturePoster'

  type Scale = (value: number) => number
  interface LayerCakeContext {
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

  const { xScale, yScale } = getContext<LayerCakeContext>('LayerCake')

  function sx(node: ArchitecturePosterNode): number {
    return $xScale(node.x)
  }

  function sy(node: ArchitecturePosterNode): number {
    return $yScale(node.y)
  }

  function badgeStyle(node: ArchitecturePosterNode, i: number): string {
    const y = sy(node) - 96 - (i % 2) * 12
    return `left:${sx(node)}px;top:${y}px;`
  }

  function orfStyle(node: ArchitecturePosterNode): string {
    return `left:${sx(node)}px;top:${sy(node) + 42}px;`
  }

  function toggle(id: string): void {
    setActive(activeId === id ? null : id)
  }

  function label(node: ArchitecturePosterNode): string {
    const el = node.glyphData
    if (!el) return node.label
    const aa = el.member.specifier.aa ?? '?'
    const codon = el.member.specifier.codon ?? 'codon ?'
    return `Element ${el.ordinal}: ${aa}, ${codon}`
  }
</script>

{#each poster.elementNodes as node, i (node.id)}
  {@const el = node.glyphData!}
  {@const active = activeId === node.id}
  <button
    type="button"
    class="tv-poster-callout"
    class:active
    style={badgeStyle(node, i)}
    aria-pressed={active}
    aria-label={label(node)}
    onmouseenter={() => setActive(node.id)}
    onmouseleave={() => setActive(null)}
    onfocus={() => setActive(node.id)}
    onblur={() => setActive(null)}
    onclick={() => toggle(node.id)}
  >
    <span class="tv-poster-swatch" style:background={aaColor(el.member.specifier.aa)} aria-hidden="true"></span>
    <span class="font-mono">{el.member.specifier.aa ?? '?'}</span>
    {#if el.member.specifier.codon}
      <span class="text-muted">{el.member.specifier.codon}</span>
    {/if}
  </button>
{/each}

<div class="tv-poster-orf-callout" style={orfStyle(poster.orfNode)}>
  <span class="font-medium text-ink">Coding region</span>
  <span class="text-muted">{(poster.orfNode.metadata?.downstreamGene as string | null) ?? 'downstream operon'}</span>
</div>

<style>
  .tv-poster-callout,
  .tv-poster-orf-callout {
    position: absolute;
    transform: translate(-50%, -50%);
    border: 1px solid var(--color-hairline);
    border-radius: 8px;
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    box-shadow: 0 8px 20px rgb(15 23 42 / 10%);
    backdrop-filter: blur(6px);
  }
  .tv-poster-callout {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 5.6rem;
    max-width: 8rem;
    padding: 0.25rem 0.45rem;
    color: var(--color-ink);
    font-size: 0.72rem;
    line-height: 1rem;
    white-space: nowrap;
    transition: border-color 150ms var(--ease-standard), box-shadow 150ms var(--ease-standard),
      transform 150ms var(--ease-standard);
  }
  .tv-poster-callout.active {
    border-color: var(--color-brand);
    box-shadow: 0 10px 24px rgb(45 110 135 / 20%);
    transform: translate(-50%, -50%) translateY(-2px);
  }
  .tv-poster-swatch {
    width: 0.65rem;
    height: 0.65rem;
    flex: 0 0 auto;
    border-radius: 0.18rem;
    box-shadow: inset 0 0 0 1px rgb(15 23 42 / 14%);
  }
  .tv-poster-orf-callout {
    display: grid;
    min-width: 8.6rem;
    max-width: 12rem;
    padding: 0.35rem 0.55rem;
    font-size: 0.72rem;
    line-height: 1rem;
    text-align: center;
  }
</style>
