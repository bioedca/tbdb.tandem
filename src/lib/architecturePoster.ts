// Editorial / figure-like adapter for the tandem architecture view.
//
// The canonical scientific geometry remains `buildArchitecture()` in
// architecture.ts. This file deliberately reuses that model, then maps it onto a
// normalized, order-first coordinate system for the illustrated Layer Cake view.
// It preserves transcript 5'->3' order and the signed spacer/overlap semantics, but
// does not preserve exact genomic scale.
import {
  buildArchitecture,
  type ArchitectureModel,
  type ElementLayout,
  type SpacerLayout,
} from './architecture'
import type { FuncClass, FuncSource, Member, Strand } from './data/types'

export type ArchitecturePosterKind =
  | 'tbox'
  | 'spacer'
  | 'overlap'
  | 'orf'
  | 'leader'
  | 'terminator'
  | 'antiterminator'
  | string

export interface ArchitecturePosterNode {
  id: string
  kind: ArchitecturePosterKind
  label: string
  start?: number
  end?: number
  order: number
  lane: number
  /** Normalized Layer Cake x coordinate. Order-preserving, not bp-scaled. */
  x: number
  /** Normalized vertical coordinate in the poster's 0..100 lane space. */
  y: number
  glyphData?: ElementLayout
  metadata?: Record<string, unknown>
}

export interface ArchitecturePosterEdge {
  id: string
  kind: 'backbone' | 'spacer' | 'overlap' | 'relationship'
  source: string
  target: string
  label?: string
  strength?: number
  metadata?: Record<string, unknown>
}

export interface ArchitecturePosterModel {
  locusId: string
  seed: number
  source: ArchitectureModel
  nodes: ArchitecturePosterNode[]
  edges: ArchitecturePosterEdge[]
  elementNodes: ArchitecturePosterNode[]
  orfNode: ArchitecturePosterNode
  relationships: Array<ArchitecturePosterEdge & { spacer: SpacerLayout }>
  xMax: number
}

export interface ArchitecturePosterOptions {
  funcClass: FuncClass
  funcSource?: FuncSource
  downstreamGene?: string | null
}

export function hashLocusId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function seededUnit(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return (x >>> 0) / 0x100000000
}

function jitter(seed: number, salt: number, amplitude: number): number {
  return (seededUnit(seed, salt) - 0.5) * amplitude * 2
}

function memberLabel(el: ElementLayout): string {
  const aa = el.member.specifier.aa ?? '?'
  const codon = el.member.specifier.codon ? `/${el.member.specifier.codon}` : ''
  return `Element ${el.ordinal} · ${aa}${codon}`
}

export function buildArchitecturePosterFromModel(
  source: ArchitectureModel,
  options: ArchitecturePosterOptions,
): ArchitecturePosterModel {
  const locusId = source.elements[0]?.member.tandem_id ?? 'unknown-locus'
  const seed = hashLocusId(locusId)
  const count = Math.max(source.elements.length, 1)
  const spacing = count >= 3 ? 1.42 : 1.78
  const firstX = 0.92

  const elementNodes: ArchitecturePosterNode[] = source.elements.map((el, i) => {
    const x = firstX + i * spacing + jitter(seed, i * 7 + 1, 0.045)
    const y = 42 + jitter(seed, i * 11 + 3, 3.5)
    return {
      id: el.member.member_id,
      kind: 'tbox',
      label: memberLabel(el),
      start: el.bodyStart,
      end: el.bodyEnd,
      order: el.ordinal,
      lane: 1,
      x,
      y,
      glyphData: el,
      metadata: {
        aa: el.member.specifier.aa ?? '?',
        codon: el.member.specifier.codon,
        type: el.member.type,
        uniqueName: el.member.unique_name,
      },
    }
  })

  const lastElementX = elementNodes[elementNodes.length - 1]?.x ?? firstX
  const orfNode: ArchitecturePosterNode = {
    id: `${locusId}.orf`,
    kind: 'orf',
    label: options.funcClass,
    order: count + 1,
    lane: 2,
    x: lastElementX + (count >= 3 ? 1.16 : 1.36),
    y: 60 + jitter(seed, 97, 2.2),
    metadata: {
      funcClass: options.funcClass,
      funcSource: options.funcSource ?? 'none',
      downstreamGene: options.downstreamGene,
    },
  }

  const relationships = source.spacers.map((spacer, i) => {
    const sourceNode = elementNodes[i]
    const targetNode = elementNodes[i + 1]
    const abs = Math.abs(spacer.gap)
    const kind = spacer.overlap ? 'overlap' : 'spacer'
    return {
      id: `${sourceNode.id}-${kind}-${targetNode.id}`,
      kind,
      source: sourceNode.id,
      target: targetNode.id,
      label: spacer.overlap ? `${abs} bp overlap` : `${spacer.gap} bp spacer`,
      strength: Math.min(1, Math.max(0.18, abs / 260)),
      metadata: { signedGap: spacer.gap },
      spacer,
    } satisfies ArchitecturePosterEdge & { spacer: SpacerLayout }
  })

  const edges: ArchitecturePosterEdge[] = [
    {
      id: `${locusId}.backbone`,
      kind: 'backbone',
      source: elementNodes[0]?.id ?? orfNode.id,
      target: orfNode.id,
      label: "5' to 3' backbone",
    },
    ...relationships,
    {
      id: `${locusId}.coding-region`,
      kind: 'relationship',
      source: elementNodes[elementNodes.length - 1]?.id ?? orfNode.id,
      target: orfNode.id,
      label: 'downstream coding region',
    },
  ]

  return {
    locusId,
    seed,
    source,
    nodes: [...elementNodes, orfNode],
    edges,
    elementNodes,
    orfNode,
    relationships,
    xMax: orfNode.x + 0.92,
  }
}

export function buildArchitecturePoster(
  members: Member[],
  strand: Strand,
  options: ArchitecturePosterOptions,
): ArchitecturePosterModel {
  return buildArchitecturePosterFromModel(buildArchitecture(members, strand), options)
}
