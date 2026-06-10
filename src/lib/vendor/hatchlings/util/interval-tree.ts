/** Lightweight augmented interval tree for efficient overlap detection and annotation stacking */

export interface Interval {
	start: number;
	end: number;
	index: number;
}

interface TreeNode {
	center: number;
	left: TreeNode | null;
	right: TreeNode | null;
	/** Intervals sorted by start */
	byStart: Interval[];
	/** Intervals sorted by end (descending) */
	byEnd: Interval[];
}

export class IntervalTree {
	private root: TreeNode | null;

	constructor(intervals: Interval[]) {
		this.root = intervals.length > 0 ? this.build(intervals) : null;
	}

	private build(intervals: Interval[]): TreeNode | null {
		if (intervals.length === 0) return null;

		// Find center point
		let min = Infinity;
		let max = -Infinity;
		for (const iv of intervals) {
			if (iv.start < min) min = iv.start;
			if (iv.end > max) max = iv.end;
		}
		const center = (min + max) / 2;

		const leftIntervals: Interval[] = [];
		const rightIntervals: Interval[] = [];
		const centerIntervals: Interval[] = [];

		for (const iv of intervals) {
			if (iv.end < center) {
				leftIntervals.push(iv);
			} else if (iv.start > center) {
				rightIntervals.push(iv);
			} else {
				centerIntervals.push(iv);
			}
		}

		return {
			center,
			left: this.build(leftIntervals),
			right: this.build(rightIntervals),
			byStart: [...centerIntervals].sort((a, b) => a.start - b.start),
			byEnd: [...centerIntervals].sort((a, b) => b.end - a.end),
		};
	}

	/** Search for all intervals overlapping [start, end) */
	search(start: number, end: number): Interval[] {
		const result: Interval[] = [];
		this.searchNode(this.root, start, end, result);
		return result;
	}

	private searchNode(node: TreeNode | null, start: number, end: number, result: Interval[]): void {
		if (!node) return;

		if (start <= node.center) {
			// Check intervals sorted by start
			for (const iv of node.byStart) {
				if (iv.start >= end) break;
				if (iv.end > start) {
					result.push(iv);
				}
			}
			this.searchNode(node.left, start, end, result);
			if (end > node.center) {
				this.searchNode(node.right, start, end, result);
			}
		} else {
			// Check intervals sorted by end (descending)
			for (const iv of node.byEnd) {
				if (iv.end <= start) break;
				if (iv.start < end) {
					result.push(iv);
				}
			}
			this.searchNode(node.right, start, end, result);
		}
	}

	/**
	 * Compute non-overlapping layers (stacking) for all intervals.
	 * Returns a Map from interval index to layer (0-based).
	 * spaceBefore/spaceAfter add padding around each interval for collision detection.
	 */
	static computeLayers(
		intervals: { start: number; end: number }[],
		spaceBefore = 0,
		spaceAfter = 0,
	): Map<number, number> {
		const result = new Map<number, number>();
		if (intervals.length === 0) return result;

		// Sort by start position, then by length (longer first for better packing)
		const sorted = intervals
			.map((iv, i) => ({ start: iv.start, end: iv.end, idx: i }))
			.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

		const layers: { end: number }[] = [];

		for (const item of sorted) {
			const paddedStart = item.start - spaceBefore;
			let assigned = -1;
			for (let i = 0; i < layers.length; i++) {
				if (paddedStart >= layers[i].end) {
					assigned = i;
					layers[i].end = item.end + spaceAfter;
					break;
				}
			}
			if (assigned === -1) {
				assigned = layers.length;
				layers.push({ end: item.end + spaceAfter });
			}
			result.set(item.idx, assigned);
		}

		return result;
	}

	/**
	 * Compute layers handling circular intervals (where start > end wraps around).
	 * Splits wrapping intervals into two and assigns the same layer to both halves.
	 */
	static computeCircularLayers(
		intervals: { start: number; end: number }[],
		totalSize: number,
		spaceBefore = 0,
		spaceAfter = 0,
	): Map<number, number> {
		// Expand circular intervals
		const expanded: { start: number; end: number; originalIdx: number }[] = [];
		for (let i = 0; i < intervals.length; i++) {
			const iv = intervals[i];
			if (iv.start <= iv.end) {
				expanded.push({ start: iv.start, end: iv.end, originalIdx: i });
			} else {
				// Wraps: split into [start..totalSize] and [0..end]
				expanded.push({ start: iv.start, end: totalSize, originalIdx: i });
				expanded.push({ start: 0, end: iv.end, originalIdx: i });
			}
		}

		// Sort and assign layers
		expanded.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

		const result = new Map<number, number>();
		const layers: { end: number }[] = [];

		for (const item of expanded) {
			// If already assigned (second half of circular), use same layer
			if (result.has(item.originalIdx)) {
				const existingLayer = result.get(item.originalIdx)!;
				layers[existingLayer].end = Math.max(layers[existingLayer].end, item.end + spaceAfter);
				continue;
			}

			const paddedStart = item.start - spaceBefore;
			let assigned = -1;
			for (let i = 0; i < layers.length; i++) {
				if (paddedStart >= layers[i].end) {
					assigned = i;
					layers[i].end = item.end + spaceAfter;
					break;
				}
			}
			if (assigned === -1) {
				assigned = layers.length;
				layers.push({ end: item.end + spaceAfter });
			}
			result.set(item.originalIdx, assigned);
		}

		return result;
	}
}
