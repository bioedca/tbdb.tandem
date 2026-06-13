<script lang="ts">
	import type { Translation } from '../../types/index.js';
	import { aminoAcidColors } from '../../util/colors.js';
	import { ANNOTATION_H, FONT_PRIMARY } from '../../util/layout.js';

	interface Props {
		/** Translation data */
		translation: Translation;
		/** Start bp of this row */
		start: number;
		/** End bp of this row */
		end: number;
		/** Y position */
		y?: number;
		/** Width of each character in pixels */
		charWidth?: number;
	}

	let { translation, start, end, y = 0, charWidth = 10 }: Props = $props();

	const CODON_WIDTH = $derived(charWidth * 3);

	// Start and stop codon colors
	const START_CODON_COLOR = '#2ecc71';
	const STOP_CODON_COLOR = '#e74c3c';

	/** Amino acids that fall within this row's visible range */
	const visibleAminoAcids = $derived.by(() => {
		const result: { aa: string; x: number; codonStart: number; index: number; isStart: boolean; isStop: boolean }[] = [];

		const aaString = translation.aminoAcids;

		for (let i = 0; i < aaString.length; i++) {
			const codonStart = translation.start + i * 3;
			const codonEnd = codonStart + 3;

			if (codonEnd > start && codonStart < end) {
				const x = Math.max(0, (codonStart - start)) * charWidth;
				result.push({
					aa: aaString[i],
					x,
					codonStart,
					index: i,
					isStart: aaString[i] === 'M' && i === 0,
					isStop: aaString[i] === '*',
				});
			}
		}
		return result;
	});

	/**
	 * Arrow-shaped path for amino acid blocks.
	 * Forward strand: notch on left, arrowhead on right.
	 * Reverse strand: arrowhead on left, notch on right.
	 */
	function aaArrowPath(x: number, w: number, ay: number, h: number, strand: number, isFirst: boolean): string {
		const tip = Math.min(4, w * 0.25);
		const midY = ay + h / 2;

		if (strand === -1) {
			if (isFirst) {
				return `M ${x + tip} ${ay} L ${x + w} ${ay} L ${x + w} ${ay + h} L ${x + tip} ${ay + h} L ${x} ${midY} Z`;
			}
			return `M ${x + tip} ${ay} L ${x + w} ${ay} L ${x + w - tip} ${midY} L ${x + w} ${ay + h} L ${x + tip} ${ay + h} L ${x} ${midY} Z`;
		}

		if (isFirst) {
			return `M ${x} ${ay} L ${x + w - tip} ${ay} L ${x + w} ${midY} L ${x + w - tip} ${ay + h} L ${x} ${ay + h} Z`;
		}
		return `M ${x} ${ay} L ${x + tip} ${midY} L ${x} ${ay + h} L ${x + w - tip} ${ay + h} L ${x + w} ${midY} L ${x + w - tip} ${ay} Z`;
	}
</script>

<g class="hatch-translation-track">
	{#each visibleAminoAcids as { aa, x, codonStart, index, isStart, isStop }}
		{@const baseColor = aminoAcidColors[aa] ?? '#999'}
		{@const color = isStart ? START_CODON_COLOR : isStop ? STOP_CODON_COLOR : baseColor}
		{@const visStart = Math.max(codonStart, start)}
		{@const visEnd = Math.min(codonStart + 3, end)}
		{@const visibleWidth = (visEnd - visStart) * charWidth}

		<!-- Arrow-shaped amino acid background -->
		<path
			d={aaArrowPath(x, visibleWidth, y, ANNOTATION_H, translation.strand ?? 1, index === 0)}
			fill={color}
			fill-opacity={isStart || isStop ? 0.35 : 0.2}
			stroke={color}
			stroke-opacity={isStart || isStop ? 0.7 : 0.4}
			stroke-width="0.5"
		/>

		<!-- Amino acid letter -->
		{#if visibleWidth >= charWidth}
			<text
				x={x + visibleWidth / 2}
				y={y + ANNOTATION_H / 2 + 1}
				text-anchor="middle"
				dominant-baseline="middle"
				fill={color}
				font-size={FONT_PRIMARY}
				font-weight="bold"
				font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
			>{aa}</text>
		{/if}
	{/each}
</g>
