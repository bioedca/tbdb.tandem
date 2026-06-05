import type { Component } from 'svelte'
import type { WrappedComponent } from 'svelte-spa-router'
import { wrap } from 'svelte-spa-router/wrap'
import Dashboard from './routes/Dashboard.svelte'
import Browse from './routes/Browse.svelte'
import LocusDetail from './routes/LocusDetail.svelte'
import Tree from './routes/Tree.svelte'
import About from './routes/About.svelte'

// Hash-based routing (PLAN §7.2) so GitHub Pages deep links resolve with no
// 404 rewrite. Keys are the in-app paths after the '#'.
//
// `/cloud` (the 3D similarity cloud, PLAN /cloud) is LAZY: a `wrap({asyncComponent})`
// code-splits its route — and the heavy `three` it dynamically imports — out of the
// boot bundle, so the dashboard's first paint never pays for WebGL (PLAN §6.2).
export const routes: Record<string, Component<any, any> | WrappedComponent> = {
  '/': Dashboard,
  '/browse': Browse,
  '/locus/:id': LocusDetail,
  '/tree': Tree,
  '/cloud': wrap({
    asyncComponent: () => import('./routes/Cloud.svelte'),
  }),
  '/about': About,
}

// `/styleguide` is a DEV-ONLY review surface for the design system (PLAN §8.5).
// Guarded by import.meta.env.DEV so the route — and its dynamic import — are
// dead-code-eliminated from the production build.
if (import.meta.env.DEV) {
  routes['/styleguide'] = wrap({
    asyncComponent: () => import('./routes/Styleguide.svelte'),
  })
}
