import type { CloudTree } from './cloud/types'
import type { TreeTipsMap } from './data/types'
import type { NewickNode } from './tree'

export const VISUALIZATION_EXCLUDED_TANDEM_IDS = ['T0281', 'T0445'] as const

export const VISUALIZATION_EXCLUSION_NOTE =
  'T0281 and T0445 remain in the database but are omitted from this visualization. Source annotation artifacts appear to merge adjacent or duplicated T-box features in those records, so the sequence layout reads them as artificial long-branch outliers; showing them would pull them far from the main cluster and compress the rest of the map.'

const EXCLUDED = new Set<string>(VISUALIZATION_EXCLUDED_TANDEM_IDS)

export function isVisualizationExcludedTandemId(tandemId: string | null | undefined): boolean {
  return tandemId != null && EXCLUDED.has(tandemId)
}

export function filterTreeTipsForVisualization(tips: TreeTipsMap): TreeTipsMap {
  const out: TreeTipsMap = {}
  for (const [uniqueName, tip] of Object.entries(tips)) {
    if (!isVisualizationExcludedTandemId(tip.tandem_id)) out[uniqueName] = tip
  }
  return out
}

function combineBranchLengths(child: string | null, parent: string | null): string | null {
  if (parent == null) return child
  if (child == null) return parent
  const a = Number(child)
  const b = Number(parent)
  return Number.isFinite(a) && Number.isFinite(b) ? String(a + b) : child
}

export function pruneExcludedNewick(
  root: NewickNode,
  tandemOf: Map<string, string>,
): NewickNode | null {
  const prune = (node: NewickNode): NewickNode | null => {
    if (node.children.length === 0) {
      const tandemId = tandemOf.get(node.name) ?? node.name
      return isVisualizationExcludedTandemId(tandemId)
        ? null
        : { name: node.name, length: node.length, children: [] }
    }

    const children = node.children
      .map(prune)
      .filter((child): child is NewickNode => child != null)

    if (children.length === 0) return null
    if (children.length === 1) {
      const only = children[0]
      return { ...only, length: combineBranchLengths(only.length, node.length) }
    }
    return { name: node.name, length: node.length, children }
  }

  return prune(root)
}

export function filterCloudTreeForVisualization(tree: CloudTree): CloudTree {
  const index = new Map<number, number>()
  const points = tree.points.filter((point, oldIndex) => {
    if (isVisualizationExcludedTandemId(point.tandem_id)) return false
    index.set(oldIndex, index.size)
    return true
  })
  const edges = tree.edges
    .map(([a, b]) => [index.get(a), index.get(b)] as const)
    .filter((edge): edge is [number, number] => edge[0] != null && edge[1] != null)

  return { ...tree, points, edges }
}
