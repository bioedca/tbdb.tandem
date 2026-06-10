<script lang="ts">
	import type { Part, CutSite } from '../../types/index.js';
	import type { HoverInfo } from '../../types/utility.js';

	// tbdb.tandem vendor adaptation: the upstream `SelectionState` class (state/selection.svelte.ts)
	// is not vendored — we never drive drag-to-select. Declare the minimal structural type the
	// (inert, un-passed) selection handlers reference so the component still type-checks.
	interface SelectionState {
		range: { start: number; end: number } | null;
		startDrag(bp: number): void;
		updateDragLinear(bp: number): void;
		endDrag(): void;
		setSelection(start: number, end: number): void;
		selectAnnotation(id: string): void;
	}
	import { formatBp, generateTicks, computeAnnotationLayers, maxLayer, buildPartHoverInfo, buildCutSiteHoverInfo, isPrimer } from '../../util/coordinates.js';
	import { getFeatureColor, PRIMER_COLOR } from '../../util/colors.js';
	import {
		LINEAR_MARGIN_LEFT, LINEAR_MARGIN_RIGHT,
		FEATURE_H, PRIMER_H, LANE_GAP, BACKBONE_STROKE,
		RULER_TICK, RULER_LABEL_GAP, RULER_LABEL_H,
		CUT_SITE_EXTEND, CUT_SITE_LABEL_H, ZONE_GAP,
		LABEL_ROW_H, CHAR_PX_SMALL,
	} from '../../util/layout.js';
	import LinearFeature from './LinearFeature.svelte';

	interface Props {
		name: string;
		size: number;
		parts?: Part[];
		cutSites?: CutSite[];
		selectionState?: SelectionState;
		width?: number;
		showTicks?: boolean;
		showInternalLabels?: boolean;
		interactive?: boolean;
		/** tbdb.tandem vendor adaptation: keep every feature on a single lane (layer 0) instead of
		 *  auto-stacking overlapping intervals. Overlapping bodies then paint on the same lane
		 *  (visibly overlapping) so a glyph overlay anchored to `backboneYOut` stays aligned and
		 *  overlaps are never silently re-laned. */
		noStack?: boolean;
		/** tbdb.tandem vendor adaptation: bindable readouts so an external overlay can align to the
		 *  computed backbone Y and total height (both in the svg's user/viewBox units). */
		backboneYOut?: number;
		totalHeightOut?: number;
		onselect?: (selection: { start: number; end: number }) => void;
		onselectionchange?: (selection: { start: number; end: number } | null) => void;
		oncaretmove?: (position: number) => void;
		onpartclick?: (part: Part) => void;
		oncopysequence?: (sequence: string) => void;
		onhoverinfo?: (info: HoverInfo | null) => void;
	}

	let {
		name,
		size,
		parts = [],
		cutSites = [],
		selectionState,
		width = 800,
		showTicks = true,
		showInternalLabels = true,
		interactive = true,
		noStack = false,
		backboneYOut = $bindable(0),
		totalHeightOut = $bindable(0),
		onselect,
		onselectionchange,
		oncaretmove,
		onpartclick,
		oncopysequence,
		onhoverinfo,
	}: Props = $props();

	let svgElement: SVGSVGElement | undefined = $state(undefined);

	// --- Layout aliases ---
	const MARGIN_LEFT = LINEAR_MARGIN_LEFT;
	const MARGIN_RIGHT = LINEAR_MARGIN_RIGHT;
	const RULER_TICK_UP = RULER_TICK;
	const RULER_TICK_DOWN = RULER_TICK;

	/** Total height of the ruler zone (backbone + ticks + labels) */
	let rulerZoneH = $derived(
		showTicks
			? RULER_TICK_UP + RULER_TICK_DOWN + RULER_LABEL_GAP + RULER_LABEL_H
			: RULER_TICK_UP + RULER_TICK_DOWN
	);

	let backboneWidth = $derived(width - MARGIN_LEFT - MARGIN_RIGHT);

	/** Convert bp to x coordinate */
	function bpToX(bp: number): number {
		return MARGIN_LEFT + (bp / size) * backboneWidth;
	}

	/** Convert x coordinate to bp */
	function xToBp(x: number): number {
		return Math.round(((x - MARGIN_LEFT) / backboneWidth) * size);
	}

	// --- Split parts into features and primers, then by strand ---
	let features = $derived(parts.filter(p => !isPrimer(p)));
	let primers = $derived(parts.filter(p => isPrimer(p)));

	let forwardFeatures = $derived(features.filter(p => p.strand !== -1));
	let reverseFeatures = $derived(features.filter(p => p.strand === -1));
	let forwardPrimers = $derived(primers.filter(p => p.strand !== -1));
	let reversePrimers = $derived(primers.filter(p => p.strand === -1));

	// --- Compute stacking layers ---
	// tbdb.tandem vendor adaptation: `noStack` collapses every interval onto layer 0.
	function layersFor(items: { start: number; end: number }[]): Map<number, number> {
		if (noStack) return new Map(items.map((_, i) => [i, 0]));
		return computeAnnotationLayers(items);
	}
	let fwdFeatureLayers = $derived.by(() => layersFor(forwardFeatures.map(p => ({ start: p.start, end: p.end }))));
	let revFeatureLayers = $derived.by(() => layersFor(reverseFeatures.map(p => ({ start: p.start, end: p.end }))));
	let fwdPrimerLayers = $derived.by(() => layersFor(forwardPrimers.map(p => ({ start: p.start, end: p.end }))));
	let revPrimerLayers = $derived.by(() => layersFor(reversePrimers.map(p => ({ start: p.start, end: p.end }))));

	let maxFwdFeatureLayer = $derived(maxLayer(fwdFeatureLayers));
	let maxRevFeatureLayer = $derived(maxLayer(revFeatureLayers));
	let maxFwdPrimerLayer = $derived(maxLayer(fwdPrimerLayers));
	let maxRevPrimerLayer = $derived(maxLayer(revPrimerLayers));

	// --- Cut site labels (greedy non-overlapping) ---
	let sortedCutSites = $derived(
		[...cutSites].sort((a, b) => a.position - b.position)
	);

	/** Unique cutters */
	let uniqueCutters = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const cs of cutSites) {
			counts.set(cs.enzyme, (counts.get(cs.enzyme) ?? 0) + 1);
		}
		const unique = new Set<string>();
		for (const [enzyme, count] of counts) {
			if (count === 1) unique.add(enzyme);
		}
		return unique;
	});

	/** Greedy label placement — skip overlapping labels */
	let cutSiteLabels = $derived.by(() => {
		if (!interactive) return [];
		const labels: { cs: CutSite; x: number; text: string; bold: boolean }[] = [];
		let lastRightEdge = -Infinity;
		const PADDING = 6;

		for (const cs of sortedCutSites) {
			const cx = bpToX(cs.position);
			const textW = cs.enzyme.length * CHAR_PX_SMALL + PADDING;
			const left = cx - textW / 2;
			if (left > lastRightEdge) {
				labels.push({
					cs,
					x: cx,
					text: cs.enzyme,
					bold: uniqueCutters.has(cs.enzyme),
				});
				lastRightEdge = cx + textW / 2;
			}
		}
		return labels;
	});

	// --- Zone Y positions (computed top-down) ---
	let cutSiteLabelZoneH = $derived(cutSiteLabels.length > 0 ? CUT_SITE_LABEL_H + ZONE_GAP : 0);

	let fwdPrimerLaneCount = $derived(maxFwdPrimerLayer + 1);
	let fwdPrimerZoneH = $derived(
		fwdPrimerLaneCount > 0 ? fwdPrimerLaneCount * (PRIMER_H + LANE_GAP) + ZONE_GAP : 0
	);

	let fwdFeatureLaneCount = $derived(maxFwdFeatureLayer + 1);
	let fwdFeatureZoneH = $derived(
		fwdFeatureLaneCount > 0 ? fwdFeatureLaneCount * (FEATURE_H + LANE_GAP) + ZONE_GAP : 0
	);

	let revFeatureLaneCount = $derived(maxRevFeatureLayer + 1);
	let revFeatureZoneH = $derived(
		revFeatureLaneCount > 0 ? revFeatureLaneCount * (FEATURE_H + LANE_GAP) + ZONE_GAP : 0
	);

	let revPrimerLaneCount = $derived(maxRevPrimerLayer + 1);
	let revPrimerZoneH = $derived(
		revPrimerLaneCount > 0 ? revPrimerLaneCount * (PRIMER_H + LANE_GAP) + ZONE_GAP : 0
	);

	let nameLabelH = LABEL_ROW_H + ZONE_GAP;

	// Zone Y offsets (top to bottom)
	let nameY = nameLabelH / 2;
	let cutSiteLabelY = $derived(nameLabelH);
	let fwdPrimerY = $derived(cutSiteLabelY + cutSiteLabelZoneH);
	let fwdFeatureY = $derived(fwdPrimerY + fwdPrimerZoneH);
	/** Y of the backbone line itself (center of the ruler zone) */
	let backboneY = $derived(fwdFeatureY + fwdFeatureZoneH + RULER_TICK_UP);
	let revFeatureY = $derived(backboneY + rulerZoneH - RULER_TICK_UP + ZONE_GAP);
	let revPrimerY = $derived(revFeatureY + revFeatureZoneH);
	let totalHeight = $derived(revPrimerY + revPrimerZoneH + 4);

	// tbdb.tandem vendor adaptation: surface the computed backbone Y + total height so an external
	// glyph overlay can align to the backbone in the same user/viewBox coordinate space.
	$effect(() => {
		backboneYOut = backboneY;
		totalHeightOut = totalHeight;
	});

	// --- Ticks ---
	let ticks = $derived(generateTicks(size));

	// --- Selection state ---
	let isSelectDragging = $state(false);
	let selectedPart: Part | null = $state(null);

	function mouseEventToBp(e: MouseEvent): number {
		const rect = svgElement?.getBoundingClientRect();
		if (!rect) return 0;
		const mx = e.clientX - rect.left;
		return Math.max(0, Math.min(size, xToBp(mx)));
	}

	function handleMouseDown(e: MouseEvent) {
		if (e.button !== 0 || !selectionState) return;
		const bp = mouseEventToBp(e);
		selectionState.startDrag(bp);
		isSelectDragging = true;
		oncaretmove?.(bp);
		// Attach window listeners for reliable drag tracking
		window.addEventListener('mousemove', handleWindowMouseMove);
		window.addEventListener('mouseup', handleWindowMouseUp);
	}

	function handleWindowMouseMove(e: MouseEvent) {
		if (!isSelectDragging || !selectionState) return;
		const bp = mouseEventToBp(e);
		selectionState.updateDragLinear(bp);
	}

	function handleWindowMouseUp() {
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
		if (!isSelectDragging || !selectionState) return;
		selectionState.endDrag();
		isSelectDragging = false;
		const range = selectionState.range;
		if (range) {
			onselect?.({ start: range.start, end: range.end });
			onselectionchange?.(range);
		} else {
			onselectionchange?.(null);
		}
	}

	function handleMouseLeave() {
		onhoverinfo?.(null);
	}

	function handlePartMouseEnter(e: MouseEvent, part: Part) {
		onhoverinfo?.(buildPartHoverInfo(part, e));
	}

	function handleCutSiteMouseEnter(e: MouseEvent, cutSite: CutSite) {
		onhoverinfo?.(buildCutSiteHoverInfo(cutSite, e));
	}

	function handlePartClick(part: Part) {
		selectedPart = part;
		onpartclick?.(part);
		if (selectionState) {
			selectionState.setSelection(part.start, part.end);
			onselect?.({ start: part.start, end: part.end });
			onselectionchange?.({ start: part.start, end: part.end });
			if (part.id) selectionState.selectAnnotation(part.id);
		}
	}

	function handleCutSiteClick(cutSite: CutSite) {
		const end = cutSite.end ?? cutSite.position + Math.max(cutSite.cutPosition ?? 1, cutSite.complementCutPosition ?? 1);
		if (selectionState) {
			selectionState.setSelection(cutSite.position, end);
			onselect?.({ start: cutSite.position, end });
			onselectionchange?.({ start: cutSite.position, end });
		}
	}

	function handleBackboneEnter(e: MouseEvent) {
		const items: { label: string; value: string | number; unit?: string }[] = [
			{ label: 'Length', value: size, unit: 'bp' },
			{ label: 'Topology', value: 'linear' },
		];
		if (parts.length > 0) items.push({ label: 'Features', value: parts.length });
		if (cutSites.length > 0) items.push({ label: 'Cut sites', value: cutSites.length });
		onhoverinfo?.({ title: name, items, position: { x: e.clientX, y: e.clientY } });
	}

	/** Compute overhang pixel widths for a primer */
	function primerOverhangs(p: Part): { left: number; right: number } {
		if (p.bindingStart === undefined || p.bindingEnd === undefined) return { left: 0, right: 0 };
		if (p.bindingStart === p.start && p.bindingEnd === p.end) return { left: 0, right: 0 };
		const leftBp = p.strand === 1
			? p.bindingStart - p.start
			: p.end - p.bindingEnd;
		const rightBp = p.strand === 1
			? p.end - p.bindingEnd
			: p.bindingStart - p.start;
		const pxPerBp = backboneWidth / size;
		return { left: Math.max(0, leftBp * pxPerBp), right: Math.max(0, rightBp * pxPerBp) };
	}

	/** Selection overlay rect */
	let selectionRect = $derived.by(() => {
		if (!selectionState) return null;
		const range = selectionState.range;
		if (!range) return null;
		const x1 = bpToX(range.start);
		const x2 = bpToX(range.end);
		return { x: Math.min(x1, x2), width: Math.abs(x2 - x1) };
	});

	/** Height of the content zone that selection overlay should cover */
	let selectionZoneTop = $derived(cutSiteLabelY);
	let selectionZoneBottom = $derived(revPrimerY + revPrimerZoneH);
</script>

<div class="linear-map" style:width="{width}px" style:position="relative">
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		bind:this={svgElement}
		{width}
		height={totalHeight}
		viewBox="0 0 {width} {totalHeight}"
		xmlns="http://www.w3.org/2000/svg"
		role="application"
		aria-label="Linear map for {name}"
		onmousedown={interactive ? handleMouseDown : undefined}
		onmouseleave={interactive ? handleMouseLeave : undefined}
		style:cursor={!interactive ? 'default' : (selectionState ? 'crosshair' : 'default')}
		style:outline="none"
	>
		<!-- Name label -->
		<text
			x={MARGIN_LEFT}
			y={nameY}
			dominant-baseline="central"
			class="map-name"
		>
			{name}
		</text>
		<text
			x={MARGIN_LEFT + name.length * 7.5 + 8}
			y={nameY}
			dominant-baseline="central"
			class="map-size"
		>
			{formatBp(size)} bp
		</text>

		<!-- Selection overlay -->
		{#if interactive && selectionRect}
			<rect
				x={selectionRect.x}
				y={selectionZoneTop}
				width={selectionRect.width}
				height={selectionZoneBottom - selectionZoneTop}
				fill="var(--hatch-selection-fill, rgba(100, 180, 255, 0.15))"
				stroke="var(--hatch-selection-stroke, rgba(100, 180, 255, 0.4))"
				stroke-width="1"
			/>
		{/if}

		<!-- Cut site labels + connector lines -->
		{#if interactive}
			{#each cutSiteLabels as lbl (lbl.cs.enzyme + lbl.cs.position)}
				{@const cx = lbl.x}
				<!-- Connector line from label to backbone -->
				<line
					x1={cx}
					y1={cutSiteLabelY + CUT_SITE_LABEL_H - 2}
					x2={cx}
					y2={backboneY}
					stroke="var(--hatch-cutsite-color, #d45858)"
					stroke-width="0.5"
					stroke-opacity="0.4"
				/>
				<!-- Label text -->
				<!-- svelte-ignore a11y_mouse_events_have_key_events -->
				<text
					x={cx}
					y={cutSiteLabelY + CUT_SITE_LABEL_H / 2}
					text-anchor="middle"
					dominant-baseline="central"
					class="cutsite-label"
					class:bold={lbl.bold}
					role="button"
					tabindex="-1"
					onmouseover={(e) => handleCutSiteMouseEnter(e, lbl.cs)}
					onmouseout={handleMouseLeave}
					onclick={() => handleCutSiteClick(lbl.cs)}
					onkeydown={(e) => { if (e.key === 'Enter') handleCutSiteClick(lbl.cs); }}
				>
					{lbl.text}
				</text>
			{/each}
		{/if}

		<!-- Forward primers -->
		{#each forwardPrimers as primer, i (primer.name + primer.start + '-fwd-primer-' + i)}
			{@const layer = fwdPrimerLayers.get(i) ?? 0}
			{@const px = bpToX(primer.start)}
			{@const pw = bpToX(primer.end) - px}
			{@const py = fwdPrimerY + layer * (PRIMER_H + LANE_GAP)}
			{@const oh = primerOverhangs(primer)}
			<LinearFeature
				part={{ ...primer, bindingStart: undefined, bindingEnd: undefined, mismatches: undefined }}
				x={px}
				y={py}
				width={pw}
				height={PRIMER_H}
				halfArrow={true}
				overrideColor={PRIMER_COLOR}
				fillOpacity={0.5}
				showInternalLabel={false}
				selected={selectedPart === primer}
				overhangLeft={oh.left}
				overhangRight={oh.right}
				onmouseenter={(e) => handlePartMouseEnter(e, primer)}
				onmouseleave={handleMouseLeave}
				onclick={() => handlePartClick(primer)}
			/>
		{/each}

		<!-- Forward features -->
		{#each forwardFeatures as feature, i (feature.name + feature.start + '-fwd-' + i)}
			{@const layer = fwdFeatureLayers.get(i) ?? 0}
			{@const fx = bpToX(feature.start)}
			{@const fw = bpToX(feature.end) - fx}
			{@const fy = fwdFeatureY + layer * (FEATURE_H + LANE_GAP)}
			<LinearFeature
				part={feature}
				x={fx}
				y={fy}
				width={fw}
				height={FEATURE_H}
				showInternalLabel={showInternalLabels}
				selected={selectedPart === feature}
				onmouseenter={(e) => handlePartMouseEnter(e, feature)}
				onmouseleave={handleMouseLeave}
				onclick={() => handlePartClick(feature)}
			/>
		{/each}

		<!-- Backbone ruler: line + ticks + labels -->
		<g class="backbone-ruler">
			<!-- Backbone line -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_mouse_events_have_key_events -->
			<line
				x1={MARGIN_LEFT}
				y1={backboneY}
				x2={MARGIN_LEFT + backboneWidth}
				y2={backboneY}
				stroke="var(--hatch-ring-color, #4a5a6a)"
				stroke-width={BACKBONE_STROKE}
				stroke-linecap="round"
				onmouseover={handleBackboneEnter}
				onmouseout={handleMouseLeave}
			/>
			<!-- Wider invisible hit area for backbone hover -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_mouse_events_have_key_events -->
			<line
				x1={MARGIN_LEFT}
				y1={backboneY}
				x2={MARGIN_LEFT + backboneWidth}
				y2={backboneY}
				stroke="transparent"
				stroke-width="8"
				onmouseover={handleBackboneEnter}
				onmouseout={handleMouseLeave}
			/>

			<!-- Tick marks extending from backbone -->
			{#if showTicks}
				{#each ticks as tick}
					{@const tx = bpToX(tick.position)}
					<line
						x1={tx}
						y1={backboneY - (tick.major ? RULER_TICK_UP : RULER_TICK_UP * 0.5)}
						x2={tx}
						y2={backboneY + (tick.major ? RULER_TICK_DOWN : RULER_TICK_DOWN * 0.5)}
						stroke={tick.major ? 'var(--hatch-tick-major, #6a7a8a)' : 'var(--hatch-tick-minor, #4a5868)'}
						stroke-width={tick.major ? 1 : 0.5}
					/>
					{#if tick.major && tick.label}
						<text
							x={tx}
							y={backboneY + RULER_TICK_DOWN + RULER_LABEL_GAP + RULER_LABEL_H / 2}
							text-anchor="middle"
							dominant-baseline="central"
							class="tick-label"
						>
							{tick.label}
						</text>
					{/if}
				{/each}
			{/if}

			<!-- 5' and 3' end markers -->
			<text
				x={MARGIN_LEFT - 4}
				y={backboneY}
				text-anchor="end"
				dominant-baseline="central"
				class="end-label"
			>5'</text>
			<text
				x={MARGIN_LEFT + backboneWidth + 4}
				y={backboneY}
				dominant-baseline="central"
				class="end-label"
			>3'</text>
		</g>

		<!-- Cut site tick marks on backbone -->
		{#each sortedCutSites as cs (cs.enzyme + cs.position)}
			{@const cx = bpToX(cs.position)}
			<!-- svelte-ignore a11y_mouse_events_have_key_events -->
			<g
				class="cutsite-mark"
				role="button"
				tabindex="-1"
				onmouseover={(e) => handleCutSiteMouseEnter(e, cs)}
				onmouseout={(e) => { if (e.currentTarget?.contains(e.relatedTarget as Node)) return; handleMouseLeave(); }}
				onclick={() => handleCutSiteClick(cs)}
				onkeydown={(e) => { if (e.key === 'Enter') handleCutSiteClick(cs); }}
			>
				<line
					x1={cx}
					y1={backboneY - CUT_SITE_EXTEND}
					x2={cx}
					y2={backboneY + CUT_SITE_EXTEND}
					stroke="var(--hatch-cutsite-color, #d45858)"
					stroke-width="1"
				/>
				<circle
					cx={cx}
					cy={backboneY}
					r="1.5"
					fill="var(--hatch-cutsite-color, #d45858)"
				/>
				<!-- Wider invisible hit area -->
				<line
					x1={cx}
					y1={backboneY - CUT_SITE_EXTEND}
					x2={cx}
					y2={backboneY + CUT_SITE_EXTEND}
					stroke="transparent"
					stroke-width="8"
				/>
			</g>
		{/each}

		<!-- Reverse features -->
		{#each reverseFeatures as feature, i (feature.name + feature.start + '-rev-' + i)}
			{@const layer = revFeatureLayers.get(i) ?? 0}
			{@const fx = bpToX(feature.start)}
			{@const fw = bpToX(feature.end) - fx}
			{@const fy = revFeatureY + layer * (FEATURE_H + LANE_GAP)}
			<LinearFeature
				part={feature}
				x={fx}
				y={fy}
				width={fw}
				height={FEATURE_H}
				showInternalLabel={showInternalLabels}
				selected={selectedPart === feature}
				onmouseenter={(e) => handlePartMouseEnter(e, feature)}
				onmouseleave={handleMouseLeave}
				onclick={() => handlePartClick(feature)}
			/>
		{/each}

		<!-- Reverse primers -->
		{#each reversePrimers as primer, i (primer.name + primer.start + '-rev-primer-' + i)}
			{@const layer = revPrimerLayers.get(i) ?? 0}
			{@const px = bpToX(primer.start)}
			{@const pw = bpToX(primer.end) - px}
			{@const py = revPrimerY + layer * (PRIMER_H + LANE_GAP)}
			{@const oh = primerOverhangs(primer)}
			<LinearFeature
				part={{ ...primer, bindingStart: undefined, bindingEnd: undefined, mismatches: undefined }}
				x={px}
				y={py}
				width={pw}
				height={PRIMER_H}
				halfArrow={true}
				overrideColor={PRIMER_COLOR}
				fillOpacity={0.5}
				showInternalLabel={false}
				selected={selectedPart === primer}
				overhangLeft={oh.left}
				overhangRight={oh.right}
				onmouseenter={(e) => handlePartMouseEnter(e, primer)}
				onmouseleave={handleMouseLeave}
				onclick={() => handlePartClick(primer)}
			/>
		{/each}
	</svg>
</div>

<style>
	.linear-map {
		display: inline-block;
		background: var(--hatch-bg, #0c1018);
		overflow: hidden;
	}

	.map-name {
		font-size: 12px;
		font-weight: 700;
		fill: var(--hatch-text, #d4dce6);
		font-family: var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace);
		user-select: none;
	}

	.map-size {
		font-size: 10px;
		fill: var(--hatch-text-muted, #8a95a5);
		font-family: var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace);
		user-select: none;
	}

	.cutsite-label {
		font-size: 8px;
		fill: var(--hatch-cutsite-color, #d45858);
		font-family: var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace);
		cursor: pointer;
		user-select: none;
	}

	.cutsite-label.bold {
		font-weight: 700;
	}

	.cutsite-mark {
		cursor: pointer;
	}

	.end-label {
		font-size: 8px;
		fill: var(--hatch-text-muted, #8a95a5);
		font-family: var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace);
		user-select: none;
	}

	.tick-label {
		font-size: 7px;
		fill: var(--hatch-axis-text, #8a95a5);
		font-family: var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace);
		pointer-events: none;
		user-select: none;
	}
</style>
