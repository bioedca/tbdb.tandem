import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// Base path (PLAN §7.4): served under /tandem-tbox-explorer/ on GitHub Pages
// (set in the Actions runner), '/' for local dev/preview. All runtime asset and
// data fetches go through import.meta.env.BASE_URL so both paths resolve.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/tandem-tbox-explorer/' : '/',
  plugins: [tailwindcss(), svelte()],
})
