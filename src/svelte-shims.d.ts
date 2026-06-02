// svelte-check strips Svelte's built-in `*.svelte` ambient module to inject precise
// per-component prop types when a `.svelte` file imports another. It does not
// generate those types for `.svelte` files imported from a plain `.ts` (e.g. the
// route table in router.ts), so it falls back to implicit-any and errors under
// strict mode. This wildcard fallback restores a typed default export there.
// Component-to-component imports still get svelte-check's precise types (an
// explicit per-file declaration wins over this wildcard).
declare module '*.svelte' {
  import type { Component } from 'svelte'
  const component: Component
  export default component
}
