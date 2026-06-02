import Dashboard from './routes/Dashboard.svelte'
import Browse from './routes/Browse.svelte'
import LocusDetail from './routes/LocusDetail.svelte'
import Tree from './routes/Tree.svelte'
import About from './routes/About.svelte'

// Hash-based routing (PLAN §7.2) so GitHub Pages deep links resolve with no
// 404 rewrite. Keys are the in-app paths after the '#'.
export const routes = {
  '/': Dashboard,
  '/browse': Browse,
  '/locus/:id': LocusDetail,
  '/tree': Tree,
  '/about': About,
}
