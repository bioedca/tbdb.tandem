// Unit: the specificity models (PLAN §10.2, §9②). Two layers:
//   1. pure folding logic on the synthetic fixtures (deterministic by construction);
//   2. real-artifact drift guards over the committed public/data/*.json — the
//      front-end mirror of data-pipeline's test_artifacts.py, pinning the locked
//      invariants (ILE×LEU = 10, 9 three-element loci, TRP bar = 139).
import { describe, expect, test } from 'vitest'
import {
  barModel,
  buildSpecMatrix,
  cellFacetValue,
  memberSpec,
  pairSpecs,
  tripleEntries,
} from '../../src/lib/specificity'
import { UNKNOWN_SPECIFIER_COLOR } from '../../src/lib/color'
import { buildMemberMap } from '../../src/lib/data/load'
import type { LociFile, MembersMap, Summary } from '../../src/lib/data/types'
import { LOCI, MEMBERS_BY_LOCUS, SUMMARY, makeMember } from '../fixtures'

import lociJson from '../../public/data/loci.json'
import membersJson from '../../public/data/members.json'
import summaryJson from '../../public/data/summary.json'

describe('memberSpec', () => {
  test('reads the member specifier, or `?` for a codon-less partial', () => {
    expect(memberSpec(makeMember({ member_id: 'X.m1', tandem_id: 'X', specifier: { aa: 'TRP', codon: 'UGG' } }))).toBe('TRP')
    expect(memberSpec(makeMember({ member_id: 'X.m1', tandem_id: 'X', specifier: { aa: null, codon: null } }))).toBe('?')
  })
})

describe('pairSpecs', () => {
  test('returns the two element specifiers in transcript-5′ ordinal order', () => {
    expect(pairSpecs(MEMBERS_BY_LOCUS.get('T0002')!)).toEqual(['ILE', 'LEU'])
    expect(pairSpecs(MEMBERS_BY_LOCUS.get('T0004')!)).toEqual(['?', 'TRP'])
  })
})

describe('buildSpecMatrix (symmetric element-pair fold)', () => {
  const m = buildSpecMatrix(LOCI, MEMBERS_BY_LOCUS)

  test('axis is element-frequency-descending with `?` forced last', () => {
    expect(m.axis).toEqual(['TRP', 'THR', 'ALA', 'ILE', 'LEU', 'VAL', '?'])
  })

  test('the grid is symmetric', () => {
    for (let i = 0; i < m.axis.length; i++) {
      for (let j = 0; j < m.axis.length; j++) {
        expect(m.z[i][j]).toBe(m.z[j][i])
      }
    }
  })

  test('the diagonal holds same-specifier pair counts', () => {
    const trp = m.axis.indexOf('TRP')
    const thr = m.axis.indexOf('THR')
    expect(m.z[trp][trp]).toBe(1) // T0001 (TRP, TRP)
    expect(m.z[thr][thr]).toBe(1) // T0003 (THR, THR)
  })

  test('off-diagonal cells fold both halves; ILE×LEU is the focal cell', () => {
    const ile = m.axis.indexOf('ILE')
    const leu = m.axis.indexOf('LEU')
    expect(m.z[ile][leu]).toBe(1)
    expect(m.ileLeu).toBe(1)
    // the `?`/TRP pair (T0004) folds onto a single off-diagonal cell
    const unk = m.axis.indexOf('?')
    const trp = m.axis.indexOf('TRP')
    expect(m.z[unk][trp]).toBe(1)
  })

  test('three-element loci are excluded from the matrix', () => {
    // T0005 is (TRP, ILE, LEU); no pair locus contributes a TRP×ILE cell.
    const trp = m.axis.indexOf('TRP')
    const ile = m.axis.indexOf('ILE')
    expect(m.z[trp][ile]).toBeNull()
  })

  test('text labels mirror non-empty counts, empty cells are blank', () => {
    const trp = m.axis.indexOf('TRP')
    const thr = m.axis.indexOf('THR')
    expect(m.text[trp][trp]).toBe('1')
    expect(m.text[trp][thr]).toBe('') // no (TRP, THR) pair
    expect(m.max).toBe(1)
  })
})

describe('cellFacetValue (folded cell → locus facet value)', () => {
  test('same-specifier and `?` collapse to one token', () => {
    expect(cellFacetValue('TRP', 'TRP')).toBe('TRP')
    expect(cellFacetValue('?', '?')).toBe('?')
    expect(cellFacetValue('?', 'TRP')).toBe('TRP')
    expect(cellFacetValue('TRP', '?')).toBe('TRP')
  })

  test('a mixed cell maps to the alphabetized A;B, fold-invariant', () => {
    expect(cellFacetValue('ILE', 'LEU')).toBe('ILE;LEU')
    expect(cellFacetValue('LEU', 'ILE')).toBe('ILE;LEU')
    expect(cellFacetValue('VAL', 'ALA')).toBe('ALA;VAL')
    expect(cellFacetValue('ALA', 'VAL')).toBe('ALA;VAL')
  })
})

describe('barModel', () => {
  const bar = barModel(SUMMARY.distributions.specifier)

  test('preserves the frequency-descending order of the distribution', () => {
    expect(bar.labels).toEqual(['TRP', 'THR', 'ILE;LEU', 'ALA;VAL', '?'])
    expect(bar.counts).toEqual([2, 1, 1, 1, 1])
  })

  test('colors: single AA hue, mixed → first constituent, `?` → grey', () => {
    expect(bar.colors[0]).toBe('#9333ea') // TRP
    expect(bar.colors[1]).toBe('#ea580c') // THR
    expect(bar.colors[2]).toBe('#4d7c0f') // ILE;LEU → ILE
    expect(bar.colors[3]).toBe('#84cc16') // ALA;VAL → ALA
    expect(bar.colors[4]).toBe(UNKNOWN_SPECIFIER_COLOR) // ?
  })
})

describe('tripleEntries', () => {
  test('surfaces only the three-element loci, specs in ordinal order', () => {
    const triples = tripleEntries(LOCI, MEMBERS_BY_LOCUS)
    expect(triples).toHaveLength(1)
    expect(triples[0].tandem_id).toBe('T0005')
    expect(triples[0].specs).toEqual(['TRP', 'ILE', 'LEU'])
  })
})

// ── Real-artifact drift guards (mirror data-pipeline/tests/test_artifacts.py) ─────
describe('committed artifacts (public/data/*.json)', () => {
  const loci = (lociJson as unknown as LociFile).loci
  const members = membersJson as unknown as MembersMap
  const summary = summaryJson as unknown as Summary
  const map = buildMemberMap(members)
  const matrix = buildSpecMatrix(loci, map)

  test('there are 470 loci and 949 members', () => {
    expect(loci).toHaveLength(470)
    expect(Object.keys(members)).toHaveLength(949)
  })

  test('the ILE×LEU branched-chain focal cell is 10 (locked invariant)', () => {
    expect(matrix.ileLeu).toBe(10)
  })

  test('the matrix diagonal TRP×TRP is 130 (PROGRESS S1.5)', () => {
    const trp = matrix.axis.indexOf('TRP')
    expect(matrix.z[trp][trp]).toBe(130)
  })

  test('the `?` sentinel is forced to the last axis position', () => {
    expect(matrix.axis[matrix.axis.length - 1]).toBe('?')
  })

  test('the real matrix is symmetric', () => {
    for (let i = 0; i < matrix.axis.length; i++) {
      for (let j = 0; j < matrix.axis.length; j++) {
        expect(matrix.z[i][j]).toBe(matrix.z[j][i])
      }
    }
  })

  test('there are 9 three-element loci', () => {
    expect(tripleEntries(loci, map)).toHaveLength(9)
  })

  test('the specifier bar leads with TRP = 139 (PLAN §9②)', () => {
    const bar = barModel(summary.distributions.specifier)
    expect(bar.labels[0]).toBe('TRP')
    expect(bar.counts[0]).toBe(139)
  })
})
