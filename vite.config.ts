import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// Base path (PLAN §7.4): served under /tbdb.tandem/ on GitHub Pages
// (set in the Actions runner), '/' for local dev/preview. All runtime asset and
// data fetches go through import.meta.env.BASE_URL so both paths resolve.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/tbdb.tandem/' : '/',
  plugins: [tailwindcss(), svelte()],
  // @molbiohive/hatchlings' ProteinViewer does a dynamic `import('3dmol/build/3Dmol.js')`
  // (3dmol is an OPTIONAL peer dep we don't install — we only use SequenceViewer/ZoomControls).
  // The dev dep-optimizer eagerly scans that dynamic import and 500s on the missing module, so
  // skip pre-bundling the package in dev. The production build (rollup) tree-shakes ProteinViewer
  // out and is unaffected by optimizeDeps.
  optimizeDeps: { exclude: ['@molbiohive/hatchlings'] },
})
