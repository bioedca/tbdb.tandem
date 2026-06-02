<script lang="ts">
  import Router, { link, router } from 'svelte-spa-router'
  import { routes } from './router'

  // Real nav (PLAN §7.2 routes); detail pages are reached from the table.
  const nav = [
    { path: '/', label: 'Dashboard' },
    { path: '/browse', label: 'Browse' },
    { path: '/tree', label: 'Tree' },
    { path: '/about', label: 'About' },
  ]
</script>

<div class="flex min-h-screen flex-col bg-surface-subtle text-body">
  <!-- Dark chrome header (PLAN §8.2). The two-bar wordmark evokes two stacked
       T-box elements (§8.1); the teal accent is the brand affordance color. -->
  <header class="bg-chrome text-chrome-fg">
    <div class="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-3">
      <a href="/" use:link class="group flex items-center gap-2.5" aria-label="TandemView — home">
        <svg viewBox="0 0 24 24" class="size-6 shrink-0" aria-hidden="true">
          <rect x="3" y="6" width="18" height="4.5" rx="2.25" fill="var(--color-chrome-fg)" />
          <rect x="3" y="13.5" width="18" height="4.5" rx="2.25" fill="var(--color-brand)" />
        </svg>
        <span class="flex items-baseline gap-2">
          <span class="text-h2 font-semibold tracking-tight text-white">TandemView</span>
          <span class="hidden text-caption text-chrome-fg/60 sm:inline"
            >tandem T-box explorer</span
          >
        </span>
      </a>

      <nav class="flex items-center gap-1 text-small" aria-label="Primary">
        {#each nav as item (item.path)}
          <a
            href={item.path}
            use:link
            class="border-b-2 px-2 py-1 transition-colors duration-150 ease-standard hover:text-white"
            class:border-brand={router.location === item.path}
            class:text-white={router.location === item.path}
            class:font-medium={router.location === item.path}
            class:border-transparent={router.location !== item.path}
            class:text-chrome-fg={router.location !== item.path}
            aria-current={router.location === item.path ? 'page' : undefined}
          >
            {item.label}
          </a>
        {/each}
      </nav>
    </div>
  </header>

  <main class="mx-auto w-full max-w-content flex-1 px-6 py-8">
    <Router {routes} />
  </main>

  <!-- Per-page attribution footer (PLAN §11.4, §8): Data: TBDB → citing page. -->
  <footer class="bg-chrome text-chrome-fg/70">
    <div
      class="mx-auto flex max-w-content flex-wrap items-center justify-between gap-2 px-6 py-3 text-caption"
    >
      <span>TandemView — a companion to <span class="font-mono">tbdb.io</span></span>
      <span>
        Data:
        <a
          href="https://tbdb.io/citing.html"
          target="_blank"
          rel="noopener noreferrer"
          class="text-chrome-fg underline decoration-chrome-fg/40 underline-offset-2 hover:text-white"
        >
          TBDB (CC-BY)
        </a>
      </span>
    </div>
  </footer>
</div>
