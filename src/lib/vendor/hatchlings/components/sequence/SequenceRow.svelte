<script lang="ts">
	import type { Part, Translation } from '../../types/index.js';
	import { nucleotideColors } from '../../util/colors.js';
	import { complementBase, countLanes } from '../../util/coordinates.js';
	import { SEQ_PAD, LINE_HEIGHT, FONT_SECONDARY } from '../../util/layout.js';
	import AnnotationTrack from './AnnotationTrack.svelte';
	import PrimerTrack from './PrimerTrack.svelte';
	import TranslationTrack from './TranslationTrack.svelte';

	interface Props {
		/** Sequence string for this row */
		seq: string;
		/** Bp position of the first base in this row (0-based) */
		start: number;
		/** Feature parts overlapping this row (no primers) */
		parts?: Part[];
		/** Primer parts overlapping this row */
		primers?: Part[];
		/** Translations overlapping this row */
		translations?: Translation[];
		/** Width of each character in pixels */
		charWidth?: number;
		/** Show position numbers on left */
		showNumbers?: boolean;
		/** Show annotation tracks */
		showAnnotations?: boolean;
		/** Show translations */
		showTranslations?: boolean;
		/** Show complement strand */
		showComplement?: boolean;
		/** Color individual bases */
		colorBases?: boolean;
		/** Extra vertical gap between annotations and sequence (for cut site labels) */
		cutsiteGap?: number;
		/** Part click callback */
		onpartclick?: (part: Part) => void;
		/** Part hover callback */
		onparthover?: (part: Part | null, e?: MouseEvent) => void;
	}

	let {
		seq,
		start,
		parts = [],
		primers = [],
		translations = [],
		charWidth = 10,
		showNumbers = true,
		showAnnotations = true,
		showTranslations = true,
		showComplement = true,
		colorBases = false,
		cutsiteGap = 0,
		onpartclick,
		onparthover,
	}: Props = $props();

	const MONO_COLOR = 'var(--hatch-seq-base-mono, #8a95a5)';

	const colorMap = nucleotideColors;

	const end = $derived(start + seq.length);
	const SEQ_X = SEQ_PAD;

	/** Compute lane count for annotation track */
	const annotationLanes = $derived.by(() => {
		if (!showAnnotations || parts.length === 0) return 0;
		return countLanes(parts.filter((p) => p.start < end && p.end > start));
	});

	const ANNOTATION_TRACK_HEIGHT = $derived(annotationLanes * 18);

	/** Compute lane count for primer track */
	const primerLanes = $derived.by(() => {
		if (!showAnnotations || primers.length === 0) return 0;
		return countLanes(primers.filter((p) => p.start < end && p.end > start));
	});

	const PRIMER_TRACK_HEIGHT = $derived(primerLanes > 0 ? primerLanes * 25 + 8 : 0);

	const RULER_HEIGHT = $derived(showNumbers ? 16 : 0);
	/** Compute tick interval so labels don't overlap.
	 * Each label needs ~5px per digit at font-size 8, plus ~6px padding. */
	const TICK_INTERVAL = $derived.by(() => {
		const maxBp = start + seq.length;
		const digitCount = String(maxBp).length;
		const labelPx = digitCount * 5 + 6;
		const minSpacingPx = labelPx + 10; // label width + gap
		const basesPerLabel = Math.ceil(minSpacingPx / charWidth);
		// Round up to a "nice" interval: 10, 20, 50, 100, 200, 500...
		const niceSteps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
		return niceSteps.find(s => s >= basesPerLabel) ?? basesPerLabel;
	});
	const annotationY = $derived(RULER_HEIGHT);
	const primerY = $derived(RULER_HEIGHT + ANNOTATION_TRACK_HEIGHT + (annotationLanes > 0 ? 4 : 0));
	const seqY = $derived(primerY + PRIMER_TRACK_HEIGHT + (primerLanes > 0 ? 4 : 0) + cutsiteGap);
	const complementY = $derived(seqY + LINE_HEIGHT + 2);
	const complementOffset = $derived(showComplement ? LINE_HEIGHT + 2 : 0);
	const translationY = $derived(seqY + LINE_HEIGHT + complementOffset + 4);
	const totalHeight = $derived(
		translationY +
			(showTranslations && translations.length > 0 ? 24 : 0)
	);
</script>

<g class="hatch-sequence-row">
	<!-- Inline position ruler with ticks every 10 bases -->
	{#if showNumbers}
		<line
			x1={SEQ_X}
			y1={RULER_HEIGHT - 2}
			x2={SEQ_X + seq.length * charWidth}
			y2={RULER_HEIGHT - 2}
			stroke="var(--hatch-line-number, #566070)"
			stroke-opacity="0.3"
			stroke-width="0.5"
		/>
		{#each { length: seq.length } as _, i}
			{@const bp = start + i + 1}
			{@const isIntervalTick = bp % TICK_INTERVAL === 0}
			{@const isFirstTick = i === 0 && !isIntervalTick}
			{@const firstTickOverlap = isFirstTick && (TICK_INTERVAL - (bp % TICK_INTERVAL)) * charWidth < String(bp).length * 5 + 16}
			{@const isTick = isIntervalTick || (isFirstTick && !firstTickOverlap)}
			{#if isTick}
				<line
					x1={SEQ_X + i * charWidth + charWidth / 2}
					y1={RULER_HEIGHT - 5}
					x2={SEQ_X + i * charWidth + charWidth / 2}
					y2={RULER_HEIGHT - 1}
					stroke="var(--hatch-line-number, #566070)"
					stroke-opacity="0.5"
					stroke-width="0.5"
				/>
				<text
					x={SEQ_X + i * charWidth + charWidth / 2}
					y={RULER_HEIGHT - 7}
					text-anchor="middle"
					fill="var(--hatch-line-number, #566070)"
					font-size={FONT_SECONDARY}
					font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
				>{bp}</text>
			{/if}
		{/each}
	{/if}

	<!-- Annotation track (features only) -->
	{#if showAnnotations && parts.length > 0}
		<g transform="translate({SEQ_X}, {annotationY})">
			<AnnotationTrack
				{parts}
				{start}
				{end}
				y={0}
				charsPerRow={seq.length}
				{charWidth}
				{onpartclick}
				{onparthover}
			/>
		</g>
	{/if}

	<!-- Primer track (offset +8 for shifted mismatch/overhang chars) -->
	{#if showAnnotations && primers.length > 0}
		<g transform="translate({SEQ_X}, {primerY + 8})">
			<PrimerTrack
				{primers}
				{start}
				{end}
				y={0}
				{charWidth}
				{onpartclick}
				{onparthover}
			/>
		</g>
	{/if}

	<!-- Strand direction labels: left side -->
	<text
		x={2}
		y={seqY + LINE_HEIGHT / 2 + 1}
		text-anchor="start"
		dominant-baseline="middle"
		fill="var(--hatch-text-dim, #566070)"
		font-size={FONT_SECONDARY}
		font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
	>5'</text>
	{#if showComplement}
		<text
			x={2}
			y={complementY + LINE_HEIGHT / 2 + 1}
			text-anchor="start"
			dominant-baseline="middle"
			fill="var(--hatch-text-dim, #566070)"
			font-size={FONT_SECONDARY}
			font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
		>3'</text>
	{/if}

	<!-- Strand direction labels: right side -->
	<text
		x={SEQ_X + seq.length * charWidth + 2}
		y={seqY + LINE_HEIGHT / 2 + 1}
		text-anchor="start"
		dominant-baseline="middle"
		fill="var(--hatch-text-dim, #566070)"
		font-size={FONT_SECONDARY}
		font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
	>3'</text>
	{#if showComplement}
		<text
			x={SEQ_X + seq.length * charWidth + 2}
			y={complementY + LINE_HEIGHT / 2 + 1}
			text-anchor="start"
			dominant-baseline="middle"
			fill="var(--hatch-text-dim, #566070)"
			font-size={FONT_SECONDARY}
			font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
		>5'</text>
	{/if}

	<!-- Forward strand bases -->
	<g transform="translate({SEQ_X}, {seqY})">
		{#each seq.split('') as base, i}
			{@const upper = base.toUpperCase()}
			{@const color = colorBases ? (colorMap[upper] ?? '#999') : MONO_COLOR}
			<text
				x={i * charWidth + charWidth / 2}
				y={LINE_HEIGHT / 2 + 1}
				text-anchor="middle"
				dominant-baseline="middle"
				fill={color}
				font-size="12"
				font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
				font-weight="500"
			>{upper}</text>
		{/each}
	</g>

	<!-- Complement strand -->
	{#if showComplement}
		<g transform="translate({SEQ_X}, {complementY})">
			{#each seq.split('') as base, i}
				{@const upper = base.toUpperCase()}
				{@const comp = complementBase(upper)}
				{@const color = colorBases ? (colorMap[comp] ?? '#999') : MONO_COLOR}
				<text
					x={i * charWidth + charWidth / 2}
					y={LINE_HEIGHT / 2 + 1}
					text-anchor="middle"
					dominant-baseline="middle"
					fill={color}
					font-size="12"
					font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
					font-weight="500"
				>{comp}</text>
			{/each}
		</g>
	{/if}

	<!-- Translation track -->
	{#if showTranslations && translations.length > 0}
		<g transform="translate({SEQ_X}, 0)">
			{#each translations as translation}
				<TranslationTrack
					{translation}
					{start}
					{end}
					y={translationY}
					{charWidth}
				/>
			{/each}
		</g>
	{/if}
</g>
