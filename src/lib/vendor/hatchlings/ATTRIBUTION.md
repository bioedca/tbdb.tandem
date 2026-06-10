# Vendored from @molbiohive/hatchlings

This directory contains source vendored from the **hatchlings** Svelte 5 scientific-visualization
component library.

- **Upstream:** https://github.com/molbiohive/hatchlings
- **Package:** `@molbiohive/hatchlings`
- **Version:** v0.8.4 (git commit `ce4cbedc6881b23cf807aca89cabff1020cd297b`)
- **License:** MIT — see [`LICENSE`](./LICENSE) (© 2026 Oleksii Stroganov)

## Why vendored (not an npm import)

`LinearMap` lives in the upstream repo (`src/lib/components/linear/`) but is **not exported** by the
published package: `src/lib/index.ts` omits the `linear/` group, and the package `exports` map only
exposes the root entry, so neither `import { LinearMap } from '@molbiohive/hatchlings'` nor a subpath
import resolves. We use the to-scale linear feature track as the base of the Tandem architecture
figure, so the component and its internal dependencies are copied here verbatim.

(`SequenceViewer`, `ZoomControls`, and the `Part`/`Translation`/`SequenceData` types **are**
exported by the package and are consumed normally from `@molbiohive/hatchlings` elsewhere in the app
— only `LinearMap` is vendored.)

## Files

Copied **verbatim** from the tag above:

- `components/linear/LinearFeature.svelte`
- `util/coordinates.ts`, `util/colors.ts`, `util/interval-tree.ts`, `util/layout.ts`
- `types/sequence.ts`, `types/utility.ts`
- `LICENSE`

Authored for the vendor copy:

- `types/index.ts` — trimmed barrel re-exporting only `sequence` + `utility` (upstream re-exports ~12 modules).
- `index.ts` — the app-facing barrel.

## The one adapted file — `components/linear/LinearMap.svelte`

Changes from upstream, each marked with a `tbdb.tandem vendor adaptation` comment:

1. The upstream `SelectionState` import (`state/selection.svelte.ts`, not vendored) is replaced with
   a minimal local structural interface — we never drive drag-to-select, so the (un-passed,
   guarded-inert) selection handlers just need the type to resolve.
2. New `noStack` prop — collapses every feature onto layer 0 instead of auto-stacking overlapping
   intervals, so overlapping element bodies paint on one lane (visibly overlapping, never silently
   re-laned) and an external glyph overlay stays aligned.
3. New bindable `backboneYOut` / `totalHeightOut` readouts (set via `$effect`) so an external SVG
   overlay can align to the computed backbone Y and total height in the same user/viewBox units.

No other files are modified.
