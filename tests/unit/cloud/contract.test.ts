// Data-contract: validate the shape of the COMMITTED public/data/cloud.json against
// the front-end CloudData type (PLAN /cloud §3.5, §7.2). Guards the build output
// regardless of the Python — a stale/corrupt artifact trips this from the TS side.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import type { CloudData, CloudTree } from '../../../src/lib/cloud/types'

// Vitest runs from the repo root, so resolve the committed artifact from cwd.
const cloud: CloudData = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/cloud.json'), 'utf-8'),
)

const SCALE = 100

describe('cloud.json contract', () => {
  test('meta is well-formed', () => {
    expect(cloud.meta.method).toBe('pcoa')
    expect(cloud.meta.scale).toBe(SCALE)
    expect(cloud.meta.k_nn).toBe(2)
    expect(cloud.meta.version).toBe(1)
    expect(typeof cloud.meta.generated).toBe('string')
  })

  for (const treeName of ['main', 'fallback'] as const) {
    describe(treeName, () => {
      const tree: CloudTree = cloud[treeName]

      test('var is six numeric ratios', () => {
        expect(tree.var).toHaveLength(6)
        expect(tree.var.every((v) => typeof v === 'number' && Number.isFinite(v))).toBe(true)
      })

      test('every point has the required keys, types and in-range coords', () => {
        expect(tree.points.length).toBeGreaterThan(0)
        for (const p of tree.points) {
          expect(typeof p.id).toBe('string')
          expect(typeof p.tandem_id).toBe('string')
          expect(typeof p.member_id).toBe('string')
          expect(typeof p.ord).toBe('number')
          expect(typeof p.mixed).toBe('boolean')
          // nullable fields are string|null / number|null
          for (const k of ['spec', 'phylum', 'func', 'type', 'conf'] as const) {
            expect(p[k] === null || typeof p[k] === 'string').toBe(true)
          }
          for (const k of ['ddg', 'ident', 'ncores'] as const) {
            expect(p[k] === null || typeof p[k] === 'number').toBe(true)
          }
          for (const axis of ['x', 'y', 'z'] as const) {
            expect(typeof p[axis]).toBe('number')
            expect(p[axis]).toBeGreaterThanOrEqual(-SCALE - 1e-6)
            expect(p[axis]).toBeLessThanOrEqual(SCALE + 1e-6)
          }
        }
      })

      test('edges are deduplicated, ordered, and reference valid point indices', () => {
        const n = tree.points.length
        const seen = new Set<string>()
        for (const [i, j] of tree.edges) {
          expect(Number.isInteger(i) && Number.isInteger(j)).toBe(true)
          expect(i).toBeGreaterThanOrEqual(0)
          expect(j).toBeLessThan(n)
          expect(i).toBeLessThan(j) // ordered (undirected, i < j)
          const key = `${i}-${j}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
        }
      })
    })
  }

  test('main is the 847-tip Stem I embedding; fallback the 102-tip antiterminator', () => {
    expect(cloud.main.points.length).toBe(847)
    expect(cloud.fallback.points.length).toBe(102)
  })
})
