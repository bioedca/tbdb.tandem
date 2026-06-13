// Unit: the pure adapters from the architecture model / a member to the hatchlings LinearMap and
// SequenceViewer data shapes. Pins the two-tone element tint, the no-gene path (no schematic ORF),
// and the 1-based→0-based offset conversion for the sequence view (see architectureMap.ts).
import { describe, expect, test } from 'vitest'
import { buildArchitecture } from '../../src/lib/architecture'
import { toLinearMapProps, toSequenceData, DOWNSTREAM_ORF_ID } from '../../src/lib/architectureMap'
import { aaColor, STEM_COLORS, TERMINATOR_COLOR } from '../../src/lib/color'
import type { FeatureName, Member, Span } from '../../src/lib/data/types'
import { makeMember, MEMBERS_BY_LOCUS } from '../fixtures'

const MISSING: Span = [0, 0] // sub-1 → validSpan drops it (absent feature)

function win(partial: Partial<Record<FeatureName, Span>>): Record<FeatureName, Span> {
  return {
    tbox: MISSING, s1: MISSING, s1_loop: MISSING, codon: MISSING,
    antiterm: MISSING, term: MISSING, discrim: MISSING, ...partial,
  }
}

/** A member with an explicit leader + per-feature windows, everything else defaulted. */
function seqMember(o: { id: string; aa: string | null; len: number; window: Partial<Record<FeatureName, Span>> }): Member {
  return makeMember({
    member_id: o.id,
    tandem_id: o.id.split('.')[0],
    specifier: { aa: o.aa, codon: o.aa ? 'NNN' : null },
    fasta_sequence: 'G'.repeat(o.len),
    coords: { leader: [1, o.len], window: win(o.window), genome: win(o.window) },
  })
}

describe('toLinearMapProps', () => {
  const members = MEMBERS_BY_LOCUS.get('T0002')! // mixed locus: ILE + LEU
  const model = buildArchitecture(members, '+')

  test('one element body part per member, passed through on a single forward lane', () => {
    // No NCBI context → no resolved gene → element bodies only (no schematic ORF appended).
    const { parts } = toLinearMapProps(model, 'biosynthesis', 'ilvD')
    expect(parts).toHaveLength(model.elements.length)
    model.elements.forEach((el, i) => {
      expect(parts[i]).toMatchObject({
        id: el.member.member_id,
        type: 'tbox',
        start: el.bodyStart,
        end: el.bodyEnd,
        strand: 1,
      })
    })
  })

  test('two-tone: each element body tinted by its OWN specifier', () => {
    const { parts } = toLinearMapProps(model, 'biosynthesis', 'ilvD')
    const colors = model.elements.map((_, i) => parts[i].color)
    expect(colors).toEqual([aaColor('ILE'), aaColor('LEU')])
    expect(colors[0]).not.toBe(colors[1])
  })

  test('no gene part is drawn when the model has no resolved gene (no schematic ORF fallback)', () => {
    const { size, parts } = toLinearMapProps(model, 'biosynthesis', 'ilvD')
    // The unresolved-gene loci show their T-boxes alone; the banner lives in the component.
    expect(parts.some((p) => p.type === 'gene')).toBe(false)
    expect(parts.some((p) => p.id === DOWNSTREAM_ORF_ID)).toBe(false)
    // The axis still spans the leaders (a little right padding past the 3′-most body).
    expect(size).toBeGreaterThanOrEqual(model.threePrimeEnd)
  })
})

describe('toSequenceData', () => {
  test('maps the leader + feature windows (1-based→0-based) and the specifier codon translation', () => {
    const m = seqMember({
      id: 'TX.m1', aa: 'ILE', len: 60,
      window: { tbox: [1, 60], s1: [7, 20], codon: [10, 12], antiterm: [40, 55], term: [50, 60], discrim: [44, 47] },
    })
    const data = toSequenceData(m)
    expect(data.seq).toBe(m.fasta_sequence)
    expect(data.alphabet).toBe('rna')
    expect(data.topology).toBe('linear')
    expect(data.cutSites).toEqual([])

    const byType = Object.fromEntries(data.parts.map((p) => [p.type, p]))
    expect(byType.s1).toMatchObject({ start: 6, end: 20, strand: 1, color: STEM_COLORS.i })
    expect(byType.codon).toMatchObject({ start: 9, end: 12, color: aaColor('ILE') })
    expect(byType.antiterm).toMatchObject({ start: 39, end: 55, color: STEM_COLORS.at })
    expect(byType.term).toMatchObject({ start: 49, end: 60, color: TERMINATOR_COLOR })
    expect(byType.discrim).toMatchObject({ start: 43, end: 47, color: STEM_COLORS.at })
    // tbox is not a sequence-highlight feature → no part for it
    expect(byType.tbox).toBeUndefined()

    expect(data.translations).toEqual([{ start: 9, end: 12, strand: 1, aminoAcids: 'I' }])
  })

  test('drops a feature window that runs off the leader 3′ end (no phantom highlight)', () => {
    const m = seqMember({ id: 'TX.m9', aa: 'LEU', len: 30, window: { tbox: [1, 30], s1: [5, 15], term: [25, 40] } })
    const types = toSequenceData(m).parts.map((p) => p.type)
    expect(types).toContain('s1')
    expect(types).not.toContain('term') // hi=40 > leader length 30 → dropped
  })

  test('omits the translation when the specifier amino acid is absent or unknown', () => {
    const noCodon = seqMember({ id: 'TX.m2', aa: null, len: 60, window: { tbox: [1, 60], s1: [7, 20] } })
    expect(toSequenceData(noCodon).translations).toEqual([])

    // codon window present but the AA is the "?" unknown → still no translation
    const unknownAa = seqMember({ id: 'TX.m3', aa: '?', len: 60, window: { tbox: [1, 60], codon: [10, 12] } })
    expect(toSequenceData(unknownAa).translations).toEqual([])
  })
})
