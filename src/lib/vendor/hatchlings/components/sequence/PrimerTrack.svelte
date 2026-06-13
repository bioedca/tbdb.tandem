<script lang="ts">
	import type { Part } from '../../types/index.js';
	import { PRIMER_COLOR } from '../../util/colors.js';
	import { IntervalTree } from '../../util/interval-tree.js';
	import { ZONE_GAP } from '../../util/layout.js';

	interface Props {
		primers: Part[];
		start: number;
		end: number;
		y?: number;
		charWidth?: number;
		onpartclick?: (part: Part) => void;
		onparthover?: (part: Part | null, e?: MouseEvent) => void;
	}

	let { primers, start, end, y = 0, charWidth = 10, onpartclick, onparthover }: Props = $props();

	const TRACK_HEIGHT = 21;
	const SHIFT_Y = 8;
	const ARROW_SKEW = 10;

	const visiblePrimers = $derived.by(() => {
		return primers.filter((p) => p.start < end && p.end > start);
	});

	const laneAssignments = $derived.by(() => {
		const intervals = visiblePrimers.map((p) => ({ start: p.start, end: p.end }));
		const layers = IntervalTree.computeLayers(intervals);
		const assignments = new Map<Part, number>();
		visiblePrimers.forEach((part, i) => {
			assignments.set(part, layers.get(i) ?? 0);
		});
		return assignments;
	});

	type BaseInfo = {
		pos: number;
		char: string;
		x: number;
		baseY: number;
		type: 'binding' | 'mismatch' | 'overhang';
	};

	/** Get the primer character at a given template position */
	function primerCharAt(primer: Part, pos: number): string {
		if (!primer.sequence) return '?';
		if (primer.strand === 1) {
			return primer.sequence[pos - primer.start] ?? '?';
		} else {
			return primer.sequence[primer.end - 1 - pos] ?? '?';
		}
	}

	/** Classify a position as binding, mismatch, or overhang */
	function classifyPos(primer: Part, pos: number): 'binding' | 'mismatch' | 'overhang' {
		const bStart = primer.bindingStart ?? primer.start;
		const bEnd = primer.bindingEnd ?? primer.end;
		if (pos < bStart || pos >= bEnd) return 'overhang';
		if (primer.mismatches?.includes(pos)) return 'mismatch';
		return 'binding';
	}

	/** Compute visible base info for a primer in this row */
	function primerBases(primer: Part, lane: number): BaseInfo[] {
		const bases: BaseInfo[] = [];
		const clippedStart = Math.max(primer.start, start);
		const clippedEnd = Math.min(primer.end, end);
		const fy = y + lane * (TRACK_HEIGHT + ZONE_GAP);

		for (let pos = clippedStart; pos < clippedEnd; pos++) {
			const type = classifyPos(primer, pos);
			const shifted = type !== 'binding';
			bases.push({
				pos,
				char: primerCharAt(primer, pos).toUpperCase(),
				x: (pos - start) * charWidth,
				baseY: shifted ? fy - SHIFT_Y : fy,
				type,
			});
		}
		return bases;
	}
</script>

<g class="hatch-primer-track">
	{#each visiblePrimers as primer}
		{@const lane = laneAssignments.get(primer) ?? 0}
		{@const bases = primerBases(primer, lane)}
		{@const labelText = primer.label ?? primer.name}
		{@const laneY = y + lane * (TRACK_HEIGHT + ZONE_GAP)}
		{@const botY = laneY + TRACK_HEIGHT}
		{@const primerLeftX = (Math.max(primer.start, start) - start) * charWidth}
		{@const primerRightX = (Math.min(primer.end, end) - start) * charWidth}
		{@const laneWidth = (end - start) * charWidth}
		{@const arrowW = 12}
		{@const fwdArrowFits = primer.strand === 1 && primerRightX + 2 + ARROW_SKEW + arrowW <= laneWidth}
		{@const revArrowFits = primer.strand !== 1 && primerLeftX - 2 - ARROW_SKEW - arrowW >= 0}
		{@const showArrow = fwdArrowFits || revArrowFits}
		<!-- svelte-ignore a11y_mouse_events_have_key_events -->
		<g
			class="primer-part"
			role="button"
			tabindex="-1"
			onclick={() => onpartclick?.(primer)}
			onkeydown={(e) => { if (e.key === 'Enter') onpartclick?.(primer); }}
			onmouseover={(e) => onparthover?.(primer, e)}
			onmouseout={(e) => { if (e.currentTarget?.contains(e.relatedTarget as Node)) return; onparthover?.(null); }}
			pointer-events="all"
		>
			<!-- Underlines for each base position (follow shifted Y) -->
			{#each bases as base}
				<line
					x1={base.x}
					y1={base.baseY + TRACK_HEIGHT}
					x2={base.x + charWidth}
					y2={base.baseY + TRACK_HEIGHT}
					stroke={PRIMER_COLOR}
					stroke-width="1.5"
					opacity={base.type === 'binding' ? 1 : 0.4}
				/>
			{/each}

			<!-- Connecting line from last base underline to arrow bottom edge -->
			{#if showArrow}
				{#if primer.strand === 1}
					<line
						x1={primerRightX}
						y1={botY}
						x2={primerRightX + 2 + ARROW_SKEW}
						y2={botY}
						stroke={PRIMER_COLOR}
						stroke-width="1.5"
					/>
				{:else}
					<line
						x1={primerLeftX - 2 - ARROW_SKEW}
						y1={botY}
						x2={primerLeftX}
						y2={botY}
						stroke={PRIMER_COLOR}
						stroke-width="1.5"
					/>
				{/if}
			{/if}

			<!-- Sequence characters -->
			{#each bases as base}
				<text
					x={base.x + charWidth / 2}
					y={base.baseY + TRACK_HEIGHT / 2 + 1}
					text-anchor="middle"
					dominant-baseline="middle"
					fill={PRIMER_COLOR}
					font-size="10"
					font-weight={base.type === 'binding' ? '700' : '500'}
					font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
					opacity={base.type === 'binding' ? 1 : 0.5}
				>
					{base.char}
				</text>
			{/each}

			<!-- Parallelogram arrowhead at 3' end, or text fallback at lane edge -->
			{#if showArrow}
				{#if primer.strand === 1}
					{@const endX = primerRightX + 2}
					{@const topY = laneY}
					<polygon
						points="{endX},{topY} {endX + arrowW},{topY} {endX + ARROW_SKEW + arrowW},{botY} {endX + ARROW_SKEW},{botY}"
						fill="none"
						stroke={PRIMER_COLOR}
						stroke-width="1.5"
						opacity="0.8"
					/>
				{:else}
					{@const startX = primerLeftX - 2}
					{@const topY = laneY}
					<polygon
						points="{startX},{topY} {startX - arrowW},{topY} {startX - ARROW_SKEW - arrowW},{botY} {startX - ARROW_SKEW},{botY}"
						fill="none"
						stroke={PRIMER_COLOR}
						stroke-width="1.5"
						opacity="0.8"
					/>
				{/if}
			{:else}
				{#if primer.strand === 1}
					<text
						x={laneWidth + 4}
						y={laneY + TRACK_HEIGHT / 2 + 1}
						text-anchor="start"
						dominant-baseline="middle"
						fill={PRIMER_COLOR}
						font-size="12"
						font-weight="700"
						font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
						opacity="0.7"
					>→</text>
				{:else}
					<text
						x={-4}
						y={laneY + TRACK_HEIGHT / 2 + 1}
						text-anchor="end"
						dominant-baseline="middle"
						fill={PRIMER_COLOR}
						font-size="12"
						font-weight="700"
						font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
						opacity="0.7"
					>←</text>
				{/if}
			{/if}

			<title>{labelText} ({primer.type}) {primer.start}..{primer.end} [{primer.strand === 1 ? '+' : '-'}]{primer.mismatches?.length ? ` ${primer.mismatches.length} mismatch(es)` : ''}</title>
		</g>
	{/each}
</g>

<style>
	.primer-part {
		cursor: pointer;
	}

	.primer-part:hover line {
		opacity: 1;
		stroke-width: 2;
	}

	.primer-part:hover polygon {
		opacity: 1;
		stroke-width: 1.8;
	}
</style>
