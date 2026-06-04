// Lazy, singleton loader for the legacy fornac RNA viewer (PLAN §7.1, §13).
//
// ── Why a classic <script>, not import('fornac') (the S2.3 mount-spike finding) ──
// fornac is a 2016 webpack UMD that bundles its own d3 v3. d3 v3's top-level IIFE
// runs `this.document` expecting sloppy-mode `this === window`. Importing fornac as
// an ES module (Vite/esbuild pre-bundle OR the rollup prod build) wraps it in
// strict mode, where that `this` is `undefined` → it throws
// "Cannot read properties of undefined (reading 'document')" at import time, in BOTH
// dev and the production build. Loading the raw UMD via a classic <script> element
// keeps it in sloppy mode, so `this === window` and the bundle assigns its namespace
// to `window.fornac` — exactly how fornac's own docs use it (`<script src=…>` →
// `new FornaContainer(…)`). The `?url` import gives Vite's hashed asset URL for the
// untouched dist file (emitted from node_modules; nothing is vendored into the repo)
// and keeps fornac entirely off the boot path — the script is fetched only when the
// RNA viewer first mounts on /locus.
import fornacUrl from 'fornac/dist/scripts/fornac.js?url'

/** The fornac container constructor: host element + options → an object with
 *  `addRNA(structure, { sequence, name })`, plus the custom-color hooks used for
 *  the per-stem overlay (`addCustomColors` sets a `{colorValues:{[structName]:
 *  {[num]:hex}}}` map; `changeColorScheme('custom')` applies it — fornac returns a
 *  literal color string for any non-numeric custom value). */
export type FornaContainerCtor = new (
  element: Element,
  options?: Record<string, unknown>,
) => {
  addRNA(structure: string, options?: Record<string, unknown>): unknown
  addCustomColors(colors: Record<string, unknown>): unknown
  changeColorScheme(scheme: string): unknown
}

interface FornaNamespace {
  FornaContainer: FornaContainerCtor
}

let pending: Promise<FornaContainerCtor> | null = null

/** Inject fornac (at most once) and resolve its FornaContainer constructor. A
 *  failed load is forgotten so a later mount can retry. Rejects when there is no
 *  DOM (e.g. SSR / a jsdom unit test, where the injected script never executes). */
export function loadFornac(): Promise<FornaContainerCtor> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.reject(new Error('fornac: no DOM'))
  }
  const w = window as unknown as { fornac?: FornaNamespace }
  if (w.fornac?.FornaContainer) return Promise.resolve(w.fornac.FornaContainer)
  if (pending) return pending

  pending = new Promise<FornaContainerCtor>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = fornacUrl
    script.async = true
    script.dataset.fornac = ''
    script.addEventListener('load', () => {
      if (w.fornac?.FornaContainer) resolve(w.fornac.FornaContainer)
      else reject(new Error('fornac: loaded without a FornaContainer global'))
    })
    script.addEventListener('error', () => reject(new Error('fornac: script failed to load')))
    document.head.appendChild(script)
  })
  pending.catch(() => {
    pending = null // allow a retry on a subsequent mount
  })
  return pending
}
