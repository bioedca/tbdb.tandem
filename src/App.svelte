<script lang="ts">
  import Router, { link } from 'svelte-spa-router'
  import { routes } from './router'
</script>

<!--
  Placeholder app shell. The branded design system — self-hosted fonts, @theme
  tokens, color palettes, and base components (PLAN §8) — lands in S1.2; the
  Tailwind utilities here are intentionally minimal scaffolding, not the identity.
-->
<div class="flex min-h-screen flex-col">
  <header class="border-b border-slate-200 px-6 py-4">
    <nav class="flex items-center gap-6 text-sm">
      <a href="/" use:link class="text-base font-semibold tracking-tight">TandemView</a>
      <a href="/browse" use:link>Browse</a>
      <a href="/tree" use:link>Tree</a>
      <a href="/locus/T0342" use:link>Locus</a>
      <a href="/about" use:link>About</a>
    </nav>
  </header>

  <main class="flex-1 px-6 py-8">
    <Router {routes} />
  </main>
</div>
