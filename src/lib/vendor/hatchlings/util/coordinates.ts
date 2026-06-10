/** Coordinate math for circular and linear sequence rendering */

import { IntervalTree } from './interval-tree.js';
import type { Part, CutSite } from '../types/sequence.js';
import type { HoverInfo } from '../types/utility.js';
import { CHAR_PX } from './layout.js';

export const TWO_PI = 2 * Math.PI;

/** DNA complement base map */
export const COMPLEMENT_MAP: Record<string, string> = {
	A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
};

/** Return the complement of a single DNA base */
export function complementBase(b: string): string {
	return COMPLEMENT_MAP[b.toUpperCase()] ?? b;
}

/** Truncate a label with ellipsis if it would exceed maxWidth pixels */
export function truncateLabel(text: string, maxWidth: number, charPx = CHAR_PX): string {
	const maxChars = Math.floor(maxWidth / charPx) - 1;
	if (maxChars <= 0) return '';
	if (text.length <= maxChars) return text;
	if (maxChars <= 2) return '';
	return text.slice(0, maxChars - 1) + '\u2026';
}

/** Count the number of non-overlapping lanes needed for a set of intervals */
export function countLanes(intervals: { start: number; end: number }[]): number {
	if (intervals.length === 0) return 0;
	const sorted = [...intervals].sort((a, b) => a.start - b.start);
	const lanes: { end: number }[] = [];
	for (const item of sorted) {
		let placed = false;
		for (const lane of lanes) {
			if (item.start >= lane.end) { lane.end = item.end; placed = true; break; }
		}
		if (!placed) lanes.push({ end: item.end });
	}
	return lanes.length;
}

/** Get the maximum layer value from a layer assignment map (-1 if empty) */
export function maxLayer(layers: Map<unknown, number>): number {
	let max = -1;
	for (const v of layers.values()) if (v > max) max = v;
	return max;
}

/** Compute the end position of a cut site */
export function cutSiteEnd(site: CutSite): number {
	if (site.end !== undefined) return site.end;
	return site.position + Math.max(site.cutPosition ?? 1, site.complementCutPosition ?? 1);
}

/** Check if a part is a primer */
export function isPrimer(part: { type: string }): boolean {
	return part.type === 'primer_bind' || part.type === 'primer';
}

/** Build HoverInfo for a Part (feature/primer). Pass size for circular sequences. */
export function buildPartHoverInfo(part: Part, e: MouseEvent, size?: number): HoverInfo {
	const bpLen = size ? ((part.end - part.start + size) % size) || size : Math.abs(part.end - part.start);
	return {
		title: part.name,
		items: [
			{ label: 'Type', value: part.type },
			{ label: 'Location', value: `${part.start}..${part.end}` },
			{ label: 'Strand', value: part.strand === 1 ? 'Forward (+)' : 'Reverse (-)' },
			{ label: 'Length', value: bpLen, unit: 'bp' },
			...(part.tm !== undefined ? [{ label: 'Tm', value: part.tm.toFixed(1), unit: '\u00B0C' }] : []),
		],
		position: { x: e.clientX, y: e.clientY },
	};
}

/** Build HoverInfo for a CutSite */
export function buildCutSiteHoverInfo(cutSite: CutSite, e: MouseEvent): HoverInfo {
	return {
		title: cutSite.enzyme,
		items: [
			{ label: 'Position', value: cutSite.position, unit: 'bp' },
			{ label: 'Strand', value: cutSite.strand === 1 ? 'Forward (+)' : 'Reverse (-)' },
			...(cutSite.overhang ? [{ label: 'Overhang', value: cutSite.overhang }] : []),
		],
		position: { x: e.clientX, y: e.clientY },
	};
}

/** Label position for relaxation */
export interface LabelPosition {
	x: number;
	y: number;
	angle: number;
	text: string;
	anchorX: number;
	anchorY: number;
}

/**
 * Convert a base-pair position to an angle on a circular map.
 * 0 bp = 12 o'clock (top), clockwise.
 */
export function bpToAngle(bp: number, totalSize: number): number {
	return (bp / totalSize) * TWO_PI - Math.PI / 2;
}

/**
 * Convert an angle to x,y coordinates on a circle.
 */
export function angleToXY(angle: number, radius: number, cx: number, cy: number): { x: number; y: number } {
	return {
		x: cx + radius * Math.cos(angle),
		y: cy + radius * Math.sin(angle),
	};
}

/**
 * Convert a bp position to x,y on a circular map.
 */
export function bpToXY(bp: number, totalSize: number, radius: number, cx: number, cy: number): { x: number; y: number } {
	const angle = bpToAngle(bp, totalSize);
	return angleToXY(angle, radius, cx, cy);
}

/**
 * Generate an SVG arc path for a feature/annotation on a circular map.
 * Returns a path `d` string for an arc from startBp to endBp.
 */
export function arcPath(
	startBp: number,
	endBp: number,
	totalSize: number,
	radius: number,
	cx: number,
	cy: number,
	width: number = 14,
): string {
	const innerR = radius - width / 2;
	const outerR = radius + width / 2;

	let arcLength = endBp - startBp;
	if (arcLength < 0) arcLength += totalSize;

	const startAngle = bpToAngle(startBp, totalSize);
	const endAngle = bpToAngle(endBp, totalSize);

	const largeArc = arcLength / totalSize > 0.5 ? 1 : 0;

	const outerStart = angleToXY(startAngle, outerR, cx, cy);
	const outerEnd = angleToXY(endAngle, outerR, cx, cy);
	const innerStart = angleToXY(startAngle, innerR, cx, cy);
	const innerEnd = angleToXY(endAngle, innerR, cx, cy);

	return [
		`M ${outerStart.x} ${outerStart.y}`,
		`A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
		`L ${innerEnd.x} ${innerEnd.y}`,
		`A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
		'Z',
	].join(' ');
}

/**
 * Generate tick mark positions for a circular map.
 */
export function generateTicks(
	totalSize: number,
	majorInterval?: number,
	minorInterval?: number,
): { position: number; major: boolean; label: string }[] {
	if (!majorInterval) {
		// Auto-calculate based on size
		if (totalSize <= 1000) majorInterval = 100;
		else if (totalSize <= 5000) majorInterval = 500;
		else if (totalSize <= 20000) majorInterval = 2000;
		else if (totalSize <= 50000) majorInterval = 5000;
		else majorInterval = 10000;
	}

	if (!minorInterval) {
		minorInterval = majorInterval / 5;
	}

	const ticks: { position: number; major: boolean; label: string }[] = [];
	for (let pos = 0; pos < totalSize; pos += minorInterval) {
		const isMajor = pos % majorInterval === 0;
		ticks.push({
			position: pos,
			major: isMajor,
			label: isMajor ? formatBp(pos) : '',
		});
	}
	return ticks;
}

/** Format a bp value for display (e.g., 2500 -> "2.5 kb") */
export function formatBp(bp: number): string {
	if (bp === 0) return '0';
	if (bp >= 1000000) return `${(bp / 1000000).toFixed(1)} Mb`;
	if (bp >= 1000) return `${(bp / 1000).toFixed(bp % 1000 === 0 ? 0 : 1)} kb`;
	return `${bp}`;
}

/**
 * Calculate the midpoint of an arc (for label placement).
 */
export function arcMidpoint(
	startBp: number,
	endBp: number,
	totalSize: number,
	radius: number,
	cx: number,
	cy: number,
): { x: number; y: number; angle: number } {
	let midBp: number;
	if (endBp >= startBp) {
		midBp = (startBp + endBp) / 2;
	} else {
		// Wraps origin
		const arcLen = endBp + totalSize - startBp;
		midBp = (startBp + arcLen / 2) % totalSize;
	}
	const angle = bpToAngle(midBp, totalSize);
	const pos = angleToXY(angle, radius, cx, cy);
	return { ...pos, angle };
}

/**
 * Generate a directed arc path with constant-width body and a clean triangular arrowhead.
 * Body arcs at full outerR/innerR the entire length — only the arrowhead tip pinches to center.
 */
export function drawDirectedArc(
	startBp: number,
	endBp: number,
	totalSize: number,
	innerR: number,
	outerR: number,
	cx: number,
	cy: number,
	strand: 1 | -1,
	arrowAngle: number = 0.06,
): string {
	let arcLength = endBp - startBp;
	if (arcLength < 0) arcLength += totalSize;

	const midR = (innerR + outerR) / 2;

	const startAngle = bpToAngle(startBp, totalSize);
	const endAngle = bpToAngle(endBp, totalSize);

	// If arc is too small, draw simple filled arc
	const arcFraction = arcLength / totalSize;
	if (arcFraction < 0.01) {
		return arcPath(startBp, endBp, totalSize, midR, cx, cy, outerR - innerR);
	}

	// Clamp arrow angle to at most 40% of the arc span so small features don't invert
	const arcAngle = arcFraction * TWO_PI;
	const effectiveArrow = Math.min(arrowAngle, arcAngle * 0.4);

	if (strand === 1) {
		// Arrow tip at endBp — body runs full width from start to arrowhead junction
		const bodyEndAngle = endAngle - effectiveArrow;
		const bodyLargeArc = ((bodyEndAngle - startAngle + TWO_PI) % TWO_PI) / TWO_PI > 0.5 ? 1 : 0;

		const oS = angleToXY(startAngle, outerR, cx, cy);
		const oE = angleToXY(bodyEndAngle, outerR, cx, cy);
		const iS = angleToXY(startAngle, innerR, cx, cy);
		const iE = angleToXY(bodyEndAngle, innerR, cx, cy);
		const tip = angleToXY(endAngle, midR, cx, cy);

		return [
			`M ${oS.x} ${oS.y}`,
			`A ${outerR} ${outerR} 0 ${bodyLargeArc} 1 ${oE.x} ${oE.y}`,
			`L ${tip.x} ${tip.y}`,
			`L ${iE.x} ${iE.y}`,
			`A ${innerR} ${innerR} 0 ${bodyLargeArc} 0 ${iS.x} ${iS.y}`,
			'Z',
		].join(' ');
	} else {
		// Arrow tip at startBp — body runs full width from arrowhead junction to end
		const bodyStartAngle = startAngle + effectiveArrow;
		const bodyLargeArc = ((endAngle - bodyStartAngle + TWO_PI) % TWO_PI) / TWO_PI > 0.5 ? 1 : 0;

		const oS = angleToXY(bodyStartAngle, outerR, cx, cy);
		const oE = angleToXY(endAngle, outerR, cx, cy);
		const iS = angleToXY(bodyStartAngle, innerR, cx, cy);
		const iE = angleToXY(endAngle, innerR, cx, cy);
		const tip = angleToXY(startAngle, midR, cx, cy);

		return [
			`M ${oS.x} ${oS.y}`,
			`A ${outerR} ${outerR} 0 ${bodyLargeArc} 1 ${oE.x} ${oE.y}`,
			`L ${iE.x} ${iE.y}`,
			`A ${innerR} ${innerR} 0 ${bodyLargeArc} 0 ${iS.x} ${iS.y}`,
			`L ${tip.x} ${tip.y}`,
			'Z',
		].join(' ');
	}
}

/**
 * Generate a half-arrow arc path for primers.
 * Forward (+): outer edge angles to tip, inner edge stays flat (at innerR)
 * Reverse (-): inner edge angles to tip, outer edge stays flat (at outerR)
 */
export function drawHalfArrowArc(
	startBp: number,
	endBp: number,
	totalSize: number,
	innerR: number,
	outerR: number,
	cx: number,
	cy: number,
	strand: 1 | -1,
	arrowAngle: number = 0.06,
): string {
	let arcLength = endBp - startBp;
	if (arcLength < 0) arcLength += totalSize;

	const startAngle = bpToAngle(startBp, totalSize);
	const endAngle = bpToAngle(endBp, totalSize);

	// If arc is too small, draw simple filled arc
	const arcFraction = arcLength / totalSize;
	if (arcFraction < 0.01) {
		const midR = (innerR + outerR) / 2;
		return arcPath(startBp, endBp, totalSize, midR, cx, cy, outerR - innerR);
	}

	// Clamp arrow angle to at most 40% of the arc span
	const arcAngleSpan = arcFraction * TWO_PI;
	const effectiveArrow = Math.min(arrowAngle, arcAngleSpan * 0.4);

	// Large arc flag for the full feature span (used by the "flat" edge)
	const fullLargeArc = ((endAngle - startAngle + TWO_PI) % TWO_PI) / TWO_PI > 0.5 ? 1 : 0;

	if (strand === 1) {
		// Forward: arrowhead at endBp, outer edge angles to tip, inner stays flat
		const bodyEndAngle = endAngle - effectiveArrow;
		const bodyLargeArc = ((bodyEndAngle - startAngle + TWO_PI) % TWO_PI) / TWO_PI > 0.5 ? 1 : 0;

		const oS = angleToXY(startAngle, outerR, cx, cy);
		const oE = angleToXY(bodyEndAngle, outerR, cx, cy);
		const iS = angleToXY(startAngle, innerR, cx, cy);
		const iE = angleToXY(endAngle, innerR, cx, cy);
		const tip = angleToXY(endAngle, outerR, cx, cy);

		return [
			`M ${oS.x} ${oS.y}`,
			`A ${outerR} ${outerR} 0 ${bodyLargeArc} 1 ${oE.x} ${oE.y}`,
			`L ${tip.x} ${tip.y}`,
			`L ${iE.x} ${iE.y}`,
			`A ${innerR} ${innerR} 0 ${fullLargeArc} 0 ${iS.x} ${iS.y}`,
			'Z',
		].join(' ');
	} else {
		// Reverse: arrowhead at startBp, inner edge angles to tip, outer stays flat
		const bodyStartAngle = startAngle + effectiveArrow;
		const bodyLargeArc = ((endAngle - bodyStartAngle + TWO_PI) % TWO_PI) / TWO_PI > 0.5 ? 1 : 0;

		const oS = angleToXY(startAngle, outerR, cx, cy);
		const oE = angleToXY(endAngle, outerR, cx, cy);
		const iS = angleToXY(bodyStartAngle, innerR, cx, cy);
		const iE = angleToXY(endAngle, innerR, cx, cy);
		const tip = angleToXY(startAngle, innerR, cx, cy);

		return [
			`M ${oS.x} ${oS.y}`,
			`A ${outerR} ${outerR} 0 ${fullLargeArc} 1 ${oE.x} ${oE.y}`,
			`L ${iE.x} ${iE.y}`,
			`A ${innerR} ${innerR} 0 ${bodyLargeArc} 0 ${iS.x} ${iS.y}`,
			`L ${tip.x} ${tip.y}`,
			`L ${oS.x} ${oS.y}`,
			'Z',
		].join(' ');
	}
}

/**
 * Compute annotation layer assignments using IntervalTree.
 * Returns a Map from interval index to layer (0-based).
 */
export function computeAnnotationLayers(
	intervals: { start: number; end: number }[],
	spaceBefore = 0,
	spaceAfter = 0,
): Map<number, number> {
	return IntervalTree.computeLayers(intervals, spaceBefore, spaceAfter);
}

/**
 * Compute annotation layers for circular sequences (handles wrapping).
 */
export function computeCircularAnnotationLayers(
	intervals: { start: number; end: number }[],
	totalSize: number,
	spaceBefore = 0,
	spaceAfter = 0,
): Map<number, number> {
	return IntervalTree.computeCircularLayers(intervals, totalSize, spaceBefore, spaceAfter);
}

/**
 * Relax label positions to avoid overlaps.
 * Force-directed relaxation with decay over multiple passes.
 */
export function relaxLabels(
	labels: LabelPosition[],
	maxRadius: number,
	spacing: number = 18,
): LabelPosition[] {
	if (labels.length === 0) return [];
	const sorted = [...labels].sort((a, b) => a.angle - b.angle);
	const PASSES = 20;
	for (let pass = 0; pass < PASSES; pass++) {
		const decay = 1 - pass / PASSES;
		for (let i = 0; i < sorted.length; i++) {
			for (let j = i + 1; j < sorted.length; j++) {
				const dy = sorted[j].y - sorted[i].y;
				const dx = sorted[j].x - sorted[i].x;
				const widthI = sorted[i].text.length * 6;
				const widthJ = sorted[j].text.length * 6;
				const minDx = (widthI + widthJ) / 2 + 4;
				if (Math.abs(dx) < minDx && Math.abs(dy) < spacing) {
					const push = (spacing - Math.abs(dy)) / 2 * decay;
					const angle = Math.atan2(dy || 0.1, dx || 0.1);
					sorted[j].x += Math.cos(angle) * push;
					sorted[j].y += Math.sin(angle) * push;
					sorted[i].x -= Math.cos(angle) * push;
					sorted[i].y -= Math.sin(angle) * push;
				}
			}
		}
	}
	return sorted;
}

/**
 * Analyze a primer's binding against a template sequence.
 * Auto-detects 5' overhang (contiguous mismatches from the 5' end)
 * and internal mismatches within the binding region.
 *
 * Returns bindingStart/bindingEnd in absolute bp coordinates and
 * mismatch positions as absolute bp positions.
 */
export function analyzePrimerBinding(
	primer: Part,
	templateSeq: string,
): { bindingStart: number; bindingEnd: number; mismatches: number[] } {
	// If explicitly provided, use those
	if (primer.bindingStart !== undefined && primer.bindingEnd !== undefined) {
		return {
			bindingStart: primer.bindingStart,
			bindingEnd: primer.bindingEnd,
			mismatches: primer.mismatches ?? [],
		};
	}

	const defaults = { bindingStart: primer.start, bindingEnd: primer.end, mismatches: primer.mismatches ?? [] };

	if (!primer.sequence) return defaults;

	const primerSeq = primer.sequence.toUpperCase();
	const len = primer.end - primer.start;

	if (primerSeq.length !== len || len === 0) return defaults;

	// Build match array: does primer[i] match expected template base?
	const matches: boolean[] = [];
	for (let i = 0; i < len; i++) {
		let expected: string;
		if (primer.strand === 1) {
			expected = (templateSeq[primer.start + i] ?? '').toUpperCase();
		} else {
			expected = COMPLEMENT_MAP[(templateSeq[primer.end - 1 - i] ?? '').toUpperCase()] ?? '';
		}
		matches.push(primerSeq[i] === expected);
	}

	// Find 5' overhang: consecutive mismatches from the start.
	// Binding begins at the first window of 2 consecutive matches.
	const WINDOW = 2;
	let overhangLen = 0;
	for (let i = 0; i <= matches.length - WINDOW; i++) {
		let allMatch = true;
		for (let j = 0; j < WINDOW; j++) {
			if (!matches[i + j]) { allMatch = false; break; }
		}
		if (allMatch) { overhangLen = i; break; }
	}

	let bindingStart: number, bindingEnd: number;
	if (primer.strand === 1) {
		bindingStart = primer.start + overhangLen;
		bindingEnd = primer.end;
	} else {
		bindingStart = primer.start;
		bindingEnd = primer.end - overhangLen;
	}

	const mismatches: number[] = [];
	for (let i = overhangLen; i < len; i++) {
		if (!matches[i]) {
			const absBp = primer.strand === 1 ? primer.start + i : primer.end - 1 - i;
			mismatches.push(absBp);
		}
	}

	return { bindingStart, bindingEnd, mismatches };
}
