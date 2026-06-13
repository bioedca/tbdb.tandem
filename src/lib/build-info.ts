// Build + source provenance, surfaced on the /about page (audit follow-up).
//
// `__BUILD_SHA__` / `__BUILD_COMMIT_DATE__` are injected as compile-time string
// constants by vite.config's `define` (resolved from git at build time). Vite
// replaces them textually in dev, test, and production; the `typeof` guards keep
// this module safe — with a clean fallback — in any context where they are not
// (e.g. a non-Vite tool importing it), since `typeof <undeclared>` never throws.
declare const __APP_VERSION__: string
declare const __BUILD_SHA__: string
declare const __BUILD_COMMIT_DATE__: string

/** Release version (semver) from package.json; `'0.0.0'` if not injected. */
export const appVersion: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : '0.0.0'

/** Short commit SHA of the build, or `'dev'` when git was unavailable. */
export const buildSha: string =
  typeof __BUILD_SHA__ === 'string' && __BUILD_SHA__ ? __BUILD_SHA__ : 'dev'

/** ISO-8601 committer date of the build's commit, or `''` when unavailable. */
export const buildCommitDate: string =
  typeof __BUILD_COMMIT_DATE__ === 'string' ? __BUILD_COMMIT_DATE__ : ''

/** Calendar day (`YYYY-MM-DD`) of the build commit, or `''` when unknown. */
export const buildCommitDay: string = buildCommitDate.slice(0, 10)

/** True for a real, git-stamped build; false for a local dev/test run. */
export const isReleaseBuild: boolean = buildSha !== 'dev'

// --- Source provenance --------------------------------------------------------
// The whole dataset is derived from one frozen public input: the TBDB master
// table (Marchand et al., 2021). These identifiers pin the exact table used, so
// the counts on the page trace back to a specific source snapshot.

/** Row count of the TBDB master table the dataset is derived from. */
export const SOURCE_TABLE_ROWS = 23535

/** SHA-256 of that `Master_tboxes.csv` (the frozen 2020 TBDB release). */
export const SOURCE_TABLE_SHA256 =
  'fbd2cd12349dbe61e07cf3dbde635b8716fa309188c723ed119620a295285aff'

/** Short, display-friendly prefix of the source-table digest. */
export const SOURCE_TABLE_SHA256_SHORT: string = SOURCE_TABLE_SHA256.slice(0, 12)
