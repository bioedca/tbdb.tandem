// tbdb.tandem similarity-tree logic (PLAN §6, §9④) — pure, framework-agnostic.
//
// The committed tree artifacts are an EXPLORATORY SIMILARITY MAP, displayed
// unrooted (PLAN §6) — NOT an ancestral-state instrument. This module is the
// dependency-free brain the `PhyloTree` component renders with `phylotree.js`:
//
//   • a tiny Newick parser / serializer (so the locus-collapse rewrite is pure
//     and unit-testable without importing the heavy `phylotree` package);
//   • the element→locus COLLAPSE (PLAN §6): the element tree is keyed by
//     `unique_name`; the default view collapses each locus whose element tips
//     form a single clade (sisters = a duplication) into one locus tip, while
//     loci whose copies are DISPERSED stay as separate tips — that dispersal IS
//     the signal the element toggle reveals;
//   • per-tip metadata maps (element level keyed by `unique_name`; locus level
//     keyed by `tandem_id`) and the specifier/phylum color accessors;
//   • support parsing for the collapse slider (FastTree writes SH-like supports
//     as internal-node labels; PLAN §6 "a collapse slider … not printed numbers").
//
// NO POLARITY. Nothing here reads or implies ancestry/direction (PLAN §6, §13);
// the midpoint root stored in `tree.nwk` is for stable layout only and the view
// displays the tree unrooted.

import { aaColor, phylumColor, splitSpecifier } from './color'
import type { TreeName, TreeTipsMap } from './data/types'

// ── Newick parse / serialize (dependency-free) ──────────────────────────────────

/** A parsed Newick node. `length` keeps the RAW branch-length token (not a float)
 *  so a parse→serialize round-trip is byte-faithful and the unrooted layout of an
 *  un-collapsed branch is unchanged. Internal-node `name` carries the support label. */
export interface NewickNode {
  name: string
  length: string | null
  children: NewickNode[]
}

const NEWICK_DELIMS = ',():;'

/** Parse a single Newick tree string into a {name,length,children} tree. Throws on
 *  malformed input. Handles branch lengths in decimal or scientific notation. */
export function parseNewick(input: string): NewickNode {
  let s = input.trim()
  if (s.endsWith(';')) s = s.slice(0, -1)
  let pos = 0

  function parseClade(): NewickNode {
    const node: NewickNode = { name: '', length: null, children: [] }
    if (s[pos] === '(') {
      pos++ // consume '('
      for (;;) {
        node.children.push(parseClade())
        if (s[pos] === ',') {
          pos++
          continue
        }
        if (s[pos] === ')') {
          pos++
          break
        }
        throw new Error(`Malformed Newick at index ${pos}: expected ',' or ')'`)
      }
    }
    // label (tip name OR internal support label) — up to the next delimiter
    let label = ''
    while (pos < s.length && !NEWICK_DELIMS.includes(s[pos])) {
      label += s[pos]
      pos++
    }
    node.name = label
    // optional `:branch_length`
    if (pos < s.length && s[pos] === ':') {
      pos++
      let len = ''
      while (pos < s.length && /[-+0-9.eE]/.test(s[pos])) {
        len += s[pos]
        pos++
      }
      node.length = len
    }
    return node
  }

  const root = parseClade()
  if (pos !== s.length) {
    throw new Error(`Trailing characters after Newick root at index ${pos}`)
  }
  return root
}

/** Serialize a {name,length,children} tree back to a Newick string (with a
 *  trailing `;`). Branch-length tokens are emitted verbatim. */
export function serializeNewick(root: NewickNode): string {
  function ser(n: NewickNode): string {
    let out = ''
    if (n.children.length > 0) out += '(' + n.children.map(ser).join(',') + ')'
    out += n.name
    if (n.length !== null) out += ':' + n.length
    return out
  }
  return ser(root) + ';'
}

/** All leaf (tip) names in document order. */
export function leafNames(root: NewickNode): string[] {
  const out: string[] = []
  const walk = (n: NewickNode): void => {
    if (n.children.length === 0) out.push(n.name)
    else n.children.forEach(walk)
  }
  walk(root)
  return out
}

/** Count of leaf tips. */
export function countLeaves(root: NewickNode): number {
  return leafNames(root).length
}

// ── Element → locus collapse (PLAN §6) ──────────────────────────────────────────

/** `unique_name → tandem_id` for the tips that live in one tree (PLAN §5.2). */
export function tipTandemMap(tips: TreeTipsMap, which: TreeName): Map<string, string> {
  const m = new Map<string, string>()
  for (const [uniqueName, tip] of Object.entries(tips)) {
    if (tip.tree === which) m.set(uniqueName, tip.tandem_id)
  }
  return m
}

/**
 * Collapse the element-level tree to a per-locus default view (PLAN §6).
 *
 * Every leaf is relabeled to its `tandem_id`. A locus whose element tips form a
 * single clade (the MRCA's leaf set is exactly that locus's tips — sisters, i.e.
 * a duplication) is collapsed to ONE leaf at the clade root. A locus whose copies
 * are DISPERSED has no such clade, so its tips stay as separate `tandem_id`-named
 * leaves — that dispersal is exactly what the element toggle is there to reveal.
 *
 * `tandemOf` maps each leaf's `unique_name` to its `tandem_id`; an unmapped leaf
 * falls back to its own name so an unexpected tip can never crash the rewrite.
 */
export function collapseToLoci(root: NewickNode, tandemOf: Map<string, string>): NewickNode {
  const tandem = (leafName: string): string => tandemOf.get(leafName) ?? leafName

  // Total tips per locus present in THIS tree.
  const total = new Map<string, number>()
  for (const ln of leafNames(root)) {
    const L = tandem(ln)
    total.set(L, (total.get(L) ?? 0) + 1)
  }

  // Annotate each subtree with its distinct loci + leaf count (post-order).
  interface Anno {
    loci: Set<string>
    count: number
  }
  const anno = new Map<NewickNode, Anno>()
  const compute = (n: NewickNode): Anno => {
    if (n.children.length === 0) {
      const a: Anno = { loci: new Set([tandem(n.name)]), count: 1 }
      anno.set(n, a)
      return a
    }
    const loci = new Set<string>()
    let count = 0
    for (const c of n.children) {
      const a = compute(c)
      a.loci.forEach((x) => loci.add(x))
      count += a.count
    }
    const a: Anno = { loci, count }
    anno.set(n, a)
    return a
  }
  compute(root)

  // Rebuild top-down: the shallowest pure-and-complete locus subtree (one locus,
  // holding all of that locus's tips) becomes a single relabeled leaf.
  const rebuild = (n: NewickNode): NewickNode => {
    if (n.children.length === 0) {
      return { name: tandem(n.name), length: n.length, children: [] }
    }
    const a = anno.get(n)!
    if (a.loci.size === 1) {
      const L = [...a.loci][0]
      if (a.count === total.get(L)) {
        return { name: L, length: n.length, children: [] } // collapse this clade
      }
    }
    return { name: n.name, length: n.length, children: n.children.map(rebuild) }
  }

  return rebuild(root)
}

// ── Per-tip metadata ─────────────────────────────────────────────────────────────

/** Element-view tip metadata, looked up by `unique_name`. */
export interface ElementTipMeta {
  kind: 'element'
  unique_name: string
  tandem_id: string
  ordinal: number
  specifier: string | null
  phylum: string | null
}

/** Locus-view tip metadata, looked up by `tandem_id` (the collapsed leaf name). */
export interface LocusTipMeta {
  kind: 'locus'
  tandem_id: string
  /** Tree-local locus specifier: the single shared specifier, or `A;B` (sorted)
   *  when this locus's tips disagree, or null if all are unknown. */
  specifier: string | null
  phylum: string | null
  memberCount: number
}

/** Element-level tip metadata for one tree, keyed by `unique_name`. */
export function buildElementTipMeta(
  tips: TreeTipsMap,
  which: TreeName,
): Map<string, ElementTipMeta> {
  const m = new Map<string, ElementTipMeta>()
  for (const [uniqueName, tip] of Object.entries(tips)) {
    if (tip.tree !== which) continue
    m.set(uniqueName, {
      kind: 'element',
      unique_name: uniqueName,
      tandem_id: tip.tandem_id,
      ordinal: tip.ordinal,
      specifier: tip.specifier,
      phylum: tip.phylum,
    })
  }
  return m
}

/** Locus-level tip metadata for one tree, keyed by `tandem_id`, aggregated over
 *  the locus's tips present in that tree. */
export function buildLocusTipMeta(tips: TreeTipsMap, which: TreeName): Map<string, LocusTipMeta> {
  const specs = new Map<string, Set<string>>()
  const phyla = new Map<string, string | null>()
  const counts = new Map<string, number>()
  for (const tip of Object.values(tips)) {
    if (tip.tree !== which) continue
    const L = tip.tandem_id
    counts.set(L, (counts.get(L) ?? 0) + 1)
    if (!specs.has(L)) specs.set(L, new Set())
    if (tip.specifier != null && tip.specifier !== '?') specs.get(L)!.add(tip.specifier)
    if (!phyla.has(L) || phyla.get(L) == null) phyla.set(L, tip.phylum)
  }
  const m = new Map<string, LocusTipMeta>()
  for (const [L, count] of counts) {
    const distinct = [...specs.get(L)!].sort()
    const specifier = distinct.length === 0 ? null : distinct.join(';')
    m.set(L, {
      kind: 'locus',
      tandem_id: L,
      specifier,
      phylum: phyla.get(L) ?? null,
      memberCount: count,
    })
  }
  return m
}

// ── Colors + support (reuse the §8.2 palettes) ───────────────────────────────────

/** Tip fill = the specifier hue (mixed → first-constituent hue, the S1.5 bar
 *  convention; `?`/null → neutral grey). The specifier is the primary color axis. */
export function specifierFill(spec: string | null | undefined): string {
  const parts = splitSpecifier(spec)
  return aaColor(parts.length > 0 ? parts[0] : null)
}

/** Tip outer ring = the neutral phylum context color (§8.2 separate ramp). */
export function phylumRing(phylum: string | null | undefined): string {
  return phylumColor(phylum)
}

/** True iff a phylum is one of the non-Firmicutes outliers (PLAN §3.1; null/
 *  unassigned counts as an outlier — the 16 non-Firmicutes loci include the 3
 *  unassigned). The near-monochrome majority (Firmicutes) is everything else. */
export function isNonFirmicutes(phylum: string | null | undefined): boolean {
  return phylum !== 'Firmicutes'
}

/** Parse a FastTree SH-like support label (an internal-node name) to a number in
 *  [0,1], or null when the label is not numeric (e.g. a tip's `unique_name`). */
export function parseSupport(name: string | null | undefined): number | null {
  if (name == null || name === '') return null
  const v = Number(name)
  return Number.isFinite(v) ? v : null
}
