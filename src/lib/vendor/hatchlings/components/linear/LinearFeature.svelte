<script lang="ts">
	import type { Part } from '../../types/index.js';
	import { getFeatureColor } from '../../util/colors.js';

	interface Props {
		part: Part;
		x: number;
		y: number;
		width: number;
		height: number;
		/** Use half-arrow rendering (for primers) */
		halfArrow?: boolean;
		/** Force color (overrides feature type color) */
		overrideColor?: string;
		/** Fill opacity (default 1.0) */
		fillOpacity?: number;
		showInternalLabel?: boolean;
		selected?: boolean;
		/** Overhang regions to render dimmed/dashed */
		overhangLeft?: number;
		overhangRight?: number;
		onmouseenter?: (e: MouseEvent) => void;
		onmouseleave?: (e: MouseEvent) => void;
		onclick?: (e: MouseEvent) => void;
	}

	let {
		part,
		x,
		y,
		width: w,
		height: h,
		halfArrow = false,
		overrideColor,
		fillOpacity = 1.0,
		showInternalLabel = true,
		selected = false,
		overhangLeft = 0,
		overhangRight = 0,
		onmouseenter,
		onmouseleave,
		onclick,
	}: Props = $props();

	let color = $derived(overrideColor ?? getFeatureColor(part.type, part.color));

	const ARROW_WIDTH = 8;

	/** Main body x/width accounting for overhangs */
	let bodyX = $derived(x + overhangLeft);
	let bodyW = $derived(w - overhangLeft - overhangRight);

	/** Arrow path for the main body region */
	let pathD = $derived.by(() => {
		const bx = bodyX;
		const bw = bodyW;
		const arrowW = Math.min(ARROW_WIDTH, bw * 0.4);

		if (halfArrow) {
			// Half-arrow: only one edge tapers
			if (part.strand === 1) {
				// Forward: top edge tapers at right, bottom flat
				return `M ${bx} ${y} L ${bx + bw - arrowW} ${y} L ${bx + bw} ${y + h / 2} L ${bx + bw - arrowW} ${y + h} L ${bx} ${y + h} Z`;
			} else {
				// Reverse: top flat, bottom edge tapers at left
				return `M ${bx + arrowW} ${y} L ${bx + bw} ${y} L ${bx + bw} ${y + h} L ${bx + arrowW} ${y + h} L ${bx} ${y + h / 2} Z`;
			}
		}

		// Full arrow: triangular tip
		if (part.strand === 1) {
			// Forward: arrow tip on right
			return `M ${bx} ${y} L ${bx + bw - arrowW} ${y} L ${bx + bw} ${y + h / 2} L ${bx + bw - arrowW} ${y + h} L ${bx} ${y + h} Z`;
		} else {
			// Reverse: arrow tip on left
			return `M ${bx + arrowW} ${y} L ${bx + bw} ${y} L ${bx + bw} ${y + h} L ${bx + arrowW} ${y + h} L ${bx} ${y + h / 2} Z`;
		}
	});

	/** Whether internal label fits */
	let showInternal = $derived.by(() => {
		if (!showInternalLabel) return false;
		const text = part.label ?? part.name;
		const textWidthPx = text.length * 5.5 + 8;
		return bodyW - ARROW_WIDTH >= textWidthPx;
	});

	/** Label x offset (center of usable body, accounting for arrow) */
	let labelX = $derived.by(() => {
		const arrowW = Math.min(ARROW_WIDTH, bodyW * 0.4);
		if (part.strand === 1) {
			return bodyX + (bodyW - arrowW) / 2;
		} else {
			return bodyX + arrowW + (bodyW - arrowW) / 2;
		}
	});
</script>

<!-- svelte-ignore a11y_mouse_events_have_key_events -->
<g
	class="linear-feature"
	class:selected
	role="button"
	tabindex="-1"
	onmouseover={onmouseenter}
	onmouseout={(e) => { if (e.currentTarget?.contains(e.relatedTarget as Node)) return; onmouseleave?.(e); }}
	onclick={onclick}
	onkeydown={(e) => { if (e.key === 'Enter' && onclick) onclick(e as unknown as MouseEvent); }}
>
	<!-- Overhang left -->
	{#if overhangLeft > 0}
		<rect
			x={x}
			{y}
			width={overhangLeft}
			height={h}
			fill={color}
			fill-opacity="0.35"
			stroke={color}
			stroke-width="1"
			stroke-dasharray="3,2"
			stroke-opacity="0.6"
		/>
	{/if}

	<!-- Overhang right -->
	{#if overhangRight > 0}
		<rect
			x={x + w - overhangRight}
			{y}
			width={overhangRight}
			height={h}
			fill={color}
			fill-opacity="0.35"
			stroke={color}
			stroke-width="1"
			stroke-dasharray="3,2"
			stroke-opacity="0.6"
		/>
	{/if}

	<!-- Main arrow body -->
	<path
		d={pathD}
		fill={color}
		fill-opacity={fillOpacity}
		stroke="var(--hatch-annotation-stroke, #fff)"
		stroke-width="0.5"
	/>

	<!-- Internal label -->
	{#if showInternal}
		<text
			x={labelX}
			y={y + h / 2}
			text-anchor="middle"
			dominant-baseline="central"
			class="feature-label"
		>
			{part.label ?? part.name}
		</text>
	{/if}
</g>

<style>
	.linear-feature {
		cursor: pointer;
		outline: none;
		user-select: none;
	}

	.linear-feature:hover path {
		stroke: var(--hatch-annotation-stroke-hover, #fff);
		stroke-width: 1.5;
	}

	.linear-feature.selected path {
		stroke: var(--hatch-annotation-stroke-hover, #fff);
		stroke-width: 2;
	}

	.feature-label {
		font-size: 9px;
		fill: var(--hatch-annotation-text, #fff);
		font-family: var(--hatch-font, -apple-system, sans-serif);
		font-weight: 600;
		pointer-events: none;
		user-select: none;
	}
</style>
