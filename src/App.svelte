<script lang="ts">
  import { onMount } from 'svelte'
  import Router, { link, router } from 'svelte-spa-router'
  import { routes } from './router'
  import { store } from './lib/stores/filters.svelte'
  import Spinner from './lib/components/Spinner.svelte'

  // Real nav (PLAN §7.2 routes); detail pages are reached from the table.
  const nav = [
    { path: '/', label: 'Dashboard' },
    { path: '/browse', label: 'Browse' },
    { path: '/tree', label: 'Similarity map' },
    { path: '/cloud', label: '3D cloud' },
    { path: '/about', label: 'About & method' },
  ]

  // Boot the staged data load (PLAN §7.3): loci.json + summary.json gate first
  // paint; members.json loads in parallel. The router mounts once core is ready.
  onMount(() => {
    store.boot()
  })
</script>

<div class="tv-app flex min-h-screen flex-col bg-surface-subtle text-body">
  <!-- Deep-blue chrome header (PLAN §8.2). The two-bar wordmark evokes two stacked
       T-box elements (§8.1); a light palette blue carries the brand mark on the bar. -->
  <header class="bg-chrome text-chrome-fg">
    <div
      class="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2.5 sm:gap-x-6 sm:px-6 sm:py-3"
    >
      <a href="/" use:link class="group flex shrink-0 items-center gap-2.5" aria-label="tbdb.tandem, home">
        <svg viewBox="0 0 24 24" class="size-6 shrink-0" aria-hidden="true">
          <rect x="3" y="6" width="18" height="4.5" rx="2.25" fill="var(--color-chrome-fg)" />
          <rect x="3" y="13.5" width="18" height="4.5" rx="2.25" fill="var(--color-brand-on-dark)" />
        </svg>
        <span class="flex items-baseline gap-2">
          <span class="text-h2 font-semibold tracking-tight text-white">tbdb<span class="text-brand-on-dark">.tandem</span></span>
          <span class="hidden text-caption text-chrome-fg/60 sm:inline"
            >tandem T-box explorer</span
          >
        </span>
      </a>

      <!-- On phones the nav wraps to its own full-width row and scrolls horizontally
           (all four labels stay reachable); on ≥sm it sits inline beside the wordmark. -->
      <nav
        class="tv-no-scrollbar -mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 text-small sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0"
        aria-label="Primary"
      >
        {#each nav as item (item.path)}
          <a
            href={item.path}
            use:link
            class="shrink-0 whitespace-nowrap border-b-2 px-2 py-1 transition-colors duration-150 ease-standard hover:text-white"
            class:border-brand-on-dark={router.location === item.path}
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

  <main class="mx-auto w-full max-w-content flex-1 px-4 py-6 sm:px-6 sm:py-8">
    {#if store.status === 'error'}
      <div
        role="alert"
        class="rounded-lg border border-hairline bg-surface p-6 text-small text-muted"
      >
        <p class="font-medium text-ink">Couldn't load the dataset.</p>
        <p class="mt-1">{store.error}</p>
      </div>
    {:else if store.status === 'ready'}
      <Router {routes} />
    {:else}
      <div class="flex min-h-[40vh] items-center justify-center">
        <Spinner size={28} label="Loading tbdb.tandem data…" />
      </div>
    {/if}
  </main>

  <!-- Per-page attribution footer (PLAN §11.4, §8): Data: TBDB → citing page. -->
  <footer class="bg-chrome text-chrome-fg/70">
    <div
      class="mx-auto flex max-w-content flex-wrap items-center justify-between gap-2 px-4 py-3 text-caption sm:px-6"
    >
      <span>tbdb.tandem, a companion to <span class="font-mono">tbdb.io</span></span>
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
