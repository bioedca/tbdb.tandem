// Public surface of the vendored @molbiohive/hatchlings components. LinearMap is not exported by the
// published package (its src/lib/index.ts omits the linear/ group and the exports map blocks subpath
// imports), so we vendor it. SequenceViewer + SelectionState ARE published, but we vendor them too so
// we can patch the viewer's pointer→base mapping to be CSS-`zoom` aware (the full-locus track is
// magnified by zooming the whole SVG). See ATTRIBUTION.md.
export { default as LinearMap } from './components/linear/LinearMap.svelte';
export { default as LinearFeature } from './components/linear/LinearFeature.svelte';
export { default as SequenceViewer } from './components/sequence/SequenceViewer.svelte';
export { SelectionState } from './state/selection.svelte.js';
export type { SelectionRange } from './state/selection.svelte.js';
export type { Part, CutSite, Translation, SequenceData, Alphabet } from './types/sequence.js';
export type { HoverInfo, InfoItem } from './types/utility.js';
