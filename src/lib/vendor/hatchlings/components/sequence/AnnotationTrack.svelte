<script lang="ts">
	import type { Part } from '../../types/index.js';
	import { getFeatureColor } from '../../util/colors.js';
	import { truncateLabel } from '../../util/coordinates.js';
	import { IntervalTree } from '../../util/interval-tree.js';
	import { ANNOTATION_H, ANNOTATION_GAP } from '../../util/layout.js';

	interface Props {
		parts: Part[];
		start: number;
		end: number;
		y?: number;
		charsPerRow?: number;
		charWidth?: number;
		onpartclick?: (part: Part) => void;
		onparthover?: (part: Part | null, e?: MouseEvent) => void;
	}

	let { parts, start, end, y = 0, charsPerRow = 60, charWidth = 10, onpartclick, onparthover }: Props = $props();

	const ARROW_WIDTH = 6;

	const visibleParts = $derived.by(() => {
		return parts.filter((p) => p.start < end && p.end > start);
	});

	/** Use IntervalTree for layer computation */
	const laneAssignments = $derived.by(() => {
		const intervals = visibleParts.map((p) => ({ start: p.start, end: p.end }));
		const layers = IntervalTree.computeLayers(intervals);
		const assignments = new Map<Part, number>();
		visibleParts.forEach((part, i) => {
			assignments.set(part, layers.get(i) ?? 0);
		});
		return assignments;
	});

	function partX(bp: number): number {
		return Math.max(0, (bp - start)) * charWidth;
	}

	function partWidth(part: Part): number {
		const visStart = Math.max(part.start, start);
		const visEnd = Math.min(part.end, end);
		return (visEnd - visStart) * charWidth;
	}

	function arrowPath(part: Part, lane: number): string {
		const clippedStart = Math.max(part.start, start);
		const clippedEnd = Math.min(part.end, end);
		const fx = partX(clippedStart);
		const fw = partWidth(part);
		const fy = y + lane * (ANNOTATION_H + ANNOTATION_GAP);
		const h = ANNOTATION_H;
		const r = h / 2;

		const continuesLeft = part.start < start;
		const continuesRight = part.end > end;

		if (fw <= ARROW_WIDTH * 2) {
			return `M ${fx} ${fy} L ${fx + fw} ${fy} L ${fx + fw} ${fy + h} L ${fx} ${fy + h} Z`;
		}

		const pts: string[] = [];

		// Left edge
		if (continuesLeft) {
			// Concave indent on left (half-circle subtraction, pairs with right bulge on prev row)
			pts.push(`M ${fx} ${fy}`);
		} else if (part.strand === -1) {
			// Reverse strand arrow tip on left
			pts.push(`M ${fx} ${fy + r}`);
			pts.push(`L ${fx + ARROW_WIDTH} ${fy}`);
		} else {
			pts.push(`M ${fx} ${fy}`);
		}

		// Top edge → right edge
		if (continuesRight) {
			pts.push(`L ${fx + fw} ${fy}`);
			// Rightward semicircle (bulges right, "continues to next row")
			pts.push(`A ${r} ${r} 0 0 1 ${fx + fw} ${fy + h}`);
		} else if (part.strand === 1) {
			// Forward strand arrow tip on right
			const bodyEnd = fx + fw - ARROW_WIDTH;
			pts.push(`L ${bodyEnd} ${fy}`);
			pts.push(`L ${fx + fw} ${fy + r}`);
			pts.push(`L ${bodyEnd} ${fy + h}`);
		} else {
			pts.push(`L ${fx + fw} ${fy}`);
			pts.push(`L ${fx + fw} ${fy + h}`);
		}

		// Bottom edge → back to left
		if (continuesLeft) {
			pts.push(`L ${fx} ${fy + h}`);
			// Concave arc: curves inward (right), creating half-circle subtraction on left
			pts.push(`A ${r} ${r} 0 0 1 ${fx} ${fy}`);
		} else if (part.strand === -1) {
			pts.push(`L ${fx + ARROW_WIDTH} ${fy + h}`);
			// Close to arrow tip
		} else {
			pts.push(`L ${fx} ${fy + h}`);
		}

		pts.push('Z');
		return pts.join(' ');
	}
</script>

<g class="hatch-annotation-track">
	{#each visibleParts as part}
		{@const lane = laneAssignments.get(part) ?? 0}
		{@const color = getFeatureColor(part.type, part.color)}
		{@const fx = partX(Math.max(part.start, start))}
		{@const fw = partWidth(part)}
		{@const fy = y + lane * (ANNOTATION_H + ANNOTATION_GAP)}
		{@const labelText = part.label ?? part.name}
		{@const displayLabel = truncateLabel(labelText, fw - 8)}

		<!-- svelte-ignore a11y_mouse_events_have_key_events -->
		<g
			class="annotation-part"
			role="button"
			tabindex="-1"
			onclick={() => onpartclick?.(part)}
			onkeydown={(e) => { if (e.key === 'Enter') onpartclick?.(part); }}
			onmouseover={(e) => onparthover?.(part, e)}
			onmouseout={(e) => { if (e.currentTarget?.contains(e.relatedTarget as Node)) return; onparthover?.(null); }}
		>
			<path
				d={arrowPath(part, lane)}
				fill={color}
				fill-opacity="0.8"
				stroke="var(--hatch-annotation-stroke, #fff)"
				stroke-width="0.5"
			/>

			{#if displayLabel}
				<text
					x={fx + fw / 2}
					y={fy + ANNOTATION_H / 2 + 1}
					text-anchor="middle"
					dominant-baseline="middle"
					fill="var(--hatch-annotation-text, #fff)"
					font-size="10"
					font-weight="600"
					font-family="var(--hatch-font, -apple-system, sans-serif)"
				>
					{displayLabel}
				</text>
			{/if}

			<title>{labelText} ({part.type}) {part.start}..{part.end} [{part.strand === 1 ? '+' : '-'}]</title>
		</g>
	{/each}
</g>

<style>
	.annotation-part {
		cursor: pointer;
	}

	.annotation-part:hover path {
		stroke: var(--hatch-annotation-stroke-hover, #fff);
		stroke-width: 1.5;
	}
</style>
