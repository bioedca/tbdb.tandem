import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// Svelte 5 runes mode is auto-detected per component; vitePreprocess enables
// <script lang="ts"> and PostCSS-less <style> handling.
export default {
  preprocess: vitePreprocess(),
}
