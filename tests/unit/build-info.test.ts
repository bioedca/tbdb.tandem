// Unit: the /about build + source provenance stamp (audit follow-up). The commit
// SHA/date are vite-`define`-injected (here resolved from the real git checkout
// under vitest, or the 'dev' fallback); the TBDB source identifiers are static
// and pin the exact frozen master table every count is derived from.
import { describe, expect, test } from 'vitest'
import {
  appVersion,
  buildSha,
  buildCommitDate,
  buildCommitDay,
  isReleaseBuild,
  SOURCE_TABLE_ROWS,
  SOURCE_TABLE_SHA256,
  SOURCE_TABLE_SHA256_SHORT,
} from '../../src/lib/build-info'

describe('build-info', () => {
  test('appVersion is a valid semver string', () => {
    // The production build injects package.json's version via vite `define` (the
    // deployed /about shows the real release, e.g. '1.0.0'); vitest does not apply
    // `define`, so here it is the '0.0.0' fallback. Either way it is valid semver.
    expect(appVersion).toMatch(/^\d+\.\d+\.\d+(?:[-+].+)?$/)
  })

  test('source-table identifiers pin the frozen TBDB master table', () => {
    // The verified Master_tboxes.csv: 23,535 rows, this exact SHA-256.
    expect(SOURCE_TABLE_ROWS).toBe(23535)
    expect(SOURCE_TABLE_SHA256).toMatch(/^[0-9a-f]{64}$/)
    expect(SOURCE_TABLE_SHA256).toBe(
      'fbd2cd12349dbe61e07cf3dbde635b8716fa309188c723ed119620a295285aff',
    )
    // The display prefix is the first 12 hex of the full digest.
    expect(SOURCE_TABLE_SHA256_SHORT).toBe(SOURCE_TABLE_SHA256.slice(0, 12))
    expect(SOURCE_TABLE_SHA256_SHORT).toHaveLength(12)
  })

  test('build identity is a 7-char sha or the dev fallback, consistently flagged', () => {
    // vite `define` replaces __BUILD_SHA__ even under vitest, so this is either a
    // real short sha (CI / worktree) or 'dev' when git was unavailable at load.
    expect(buildSha === 'dev' || /^[0-9a-f]{7}$/.test(buildSha)).toBe(true)
    expect(isReleaseBuild).toBe(buildSha !== 'dev')
  })

  test('commit day is the YYYY-MM-DD slice of the ISO commit date (or empty)', () => {
    expect(buildCommitDate === '' || !Number.isNaN(Date.parse(buildCommitDate))).toBe(true)
    expect(buildCommitDay).toBe(buildCommitDate.slice(0, 10))
    if (buildCommitDay) expect(buildCommitDay).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
