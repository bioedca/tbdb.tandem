import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

// Build-time provenance stamp (audit follow-up): the build's commit + its date
// are injected as compile-time string constants and surfaced on the /about page,
// so a reader can tell which build — and which source commit — they are looking
// at. Resolution is best-effort: a checkout without git falls back to ''/'dev'
// and the page shows "local build". GITHUB_SHA (set on the Actions runner) is
// preferred since the deploy checkout is shallow but always carries it.
function gitOutput(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}
const buildSha = (process.env.GITHUB_SHA || gitOutput('git rev-parse HEAD')).slice(0, 7)
const buildCommitDate = gitOutput('git show -s --format=%cI HEAD')

// Base path (PLAN §7.4): served under /tbdb.tandem/ on GitHub Pages
// (set in the Actions runner), '/' for local dev/preview. All runtime asset and
// data fetches go through import.meta.env.BASE_URL so both paths resolve.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/tbdb.tandem/' : '/',
  // Compile-time constants for the /about build stamp (src/lib/build-info.ts).
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_COMMIT_DATE__: JSON.stringify(buildCommitDate),
  },
  plugins: [tailwindcss(), svelte()],
  // @molbiohive/hatchlings' ProteinViewer does a dynamic `import('3dmol/build/3Dmol.js')`
  // (3dmol is an OPTIONAL peer dep we don't install — we only use SequenceViewer/ZoomControls).
  // The dev dep-optimizer eagerly scans that dynamic import and 500s on the missing module, so
  // skip pre-bundling the package in dev. The production build (rollup) tree-shakes ProteinViewer
  // out and is unaffected by optimizeDeps.
  optimizeDeps: { exclude: ['@molbiohive/hatchlings'] },
})
