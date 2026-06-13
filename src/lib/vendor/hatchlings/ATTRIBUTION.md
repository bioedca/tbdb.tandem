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

`SequenceViewer` (and its `SelectionState`) **is** exported by the package, but we vendor it too: the
full-locus sequence track is magnified by CSS-`zoom`ing the whole SVG (the glyph font is fixed at
12 px, so it cannot be enlarged any other way), and the upstream viewer's pointer→base mapping reads
`getBoundingClientRect()` (post-zoom screen px) against unscaled SVG user units — so a click/drag lands
on the wrong base under zoom. Vendoring lets us patch that one function. The
`Part`/`Translation`/`SequenceData` types are re-exported from the vendored `types/`.

## Files

Copied **verbatim** from the tag above:

- `components/linear/LinearFeature.svelte`
- `components/sequence/SequenceRow.svelte`, `AnnotationTrack.svelte`, `PrimerTrack.svelte`, `TranslationTrack.svelte`
- `util/coordinates.ts`, `util/colors.ts`, `util/interval-tree.ts`, `util/layout.ts`
- `types/sequence.ts`, `types/utility.ts`
- `LICENSE`

Authored for the vendor copy:

- `types/index.ts` — trimmed barrel re-exporting only `sequence` + `utility` (upstream re-exports ~12 modules).
- `state/selection.svelte.ts` — the upstream `SelectionState` runes class, re-typed from its sibling
  `.d.ts` (the published file is compiled JS); behaviour is unchanged.
- `state/index.ts` — re-exports `SelectionState` (mirrors upstream `state/index.js`).
- `index.ts` — the app-facing barrel.

## The adapted files

Each change is marked with a `tbdb.tandem vendor adaptation` comment.

### `components/sequence/SequenceViewer.svelte`

1. `svgCoordsFromEvent` divides the rect-relative pointer offset by the actual rendered scale
   (`rect.width / svgWidth`, via `seqPointerScale` in `src/lib/locusSeqZoom.ts`) before mapping to a
   base, so a click/drag is correct under the host's CSS `zoom` (and any other rendered scaling).
   Upstream used the raw offset, which over-counts by the zoom factor.
2. An `$effect` teardown removes the drag `mousemove`/`mouseup` window listeners on unmount, so they
   can't leak if the component is destroyed mid-drag (the same hardening as adaptation #4 on LinearMap).
3. `handleMouseDown` ignores non-primary buttons (`if (e.button !== 0) return`), so a right/middle
   click no longer clears the selection — the host opens a copy menu on right-click that acts on it.

Rendering is byte-identical, so `tests/component/SequenceFitGeometry.test.ts` still locks the layout
against the published component.

### `components/linear/LinearMap.svelte`

Changes from upstream, each marked with a `tbdb.tandem vendor adaptation` comment:

1. The upstream `SelectionState` import (`state/selection.svelte.ts`, not vendored) is replaced with
   a minimal local structural interface — we never drive drag-to-select, so the (un-passed,
   guarded-inert) selection handlers just need the type to resolve.
2. New `noStack` prop — collapses every feature onto layer 0 instead of auto-stacking overlapping
   intervals, so overlapping element bodies paint on one lane (visibly overlapping, never silently
   re-laned) and an external glyph overlay stays aligned.
3. New bindable `backboneYOut` / `totalHeightOut` readouts (set via `$effect`) so an external SVG
   overlay can align to the computed backbone Y and total height in the same user/viewBox units.
4. `onDestroy` cleanup that removes the drag `mousemove`/`mouseup` window listeners, so they can't
   leak if the component unmounts mid-drag (a latent upstream issue; moot here since drag-select is
   unused, but hardened regardless).
5. Divide-by-zero guards in `bpToX`/`xToBp` so a degenerate zero `size` / non-positive width returns
   the left margin instead of NaN coordinates (our caller already passes `size ≥ 1`; defensive).

No other files are modified.
