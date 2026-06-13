<script lang="ts">
	import type { Part, CutSite, Translation, SequenceData } from '../../types/index.js';
	import type { SelectionState } from '../../state/index.js';
	import type { HoverInfo } from '../../types/utility.js';
	import { analyzePrimerBinding, countLanes, cutSiteEnd, buildPartHoverInfo, buildCutSiteHoverInfo, isPrimer } from '../../util/coordinates.js';
	import { SEQ_PAD, ROW_PADDING, BUFFER_ROWS, CUTSITE_LABEL_H, FONT_SECONDARY } from '../../util/layout.js';
	// tbdb.tandem vendor adaptation: zoom-aware pointer→user-space scale (this viewer is rendered
	// inside a CSS-`zoom`ed wrapper). See svgCoordsFromEvent below + src/lib/locusSeqZoom.ts.
	import { seqPointerScale } from '../../../../locusSeqZoom.js';
	import SequenceRow from './SequenceRow.svelte';

	interface Props {
		data?: SequenceData;
		/** Full sequence string */
		seq?: string;
		/** Part annotations (unified features + primers) */
		parts?: Part[];
		/** Restriction enzyme cut sites */
		cutSites?: CutSite[];
		/** Translation tracks */
		translations?: Translation[];
		/** Shared selection state (for cross-view sync) */
		selectionState?: SelectionState;
		/** Number of characters per row */
		charsPerRow?: number;
		/** Width of each character in pixels */
		charWidth?: number;
		/** Container width in pixels */
		width?: number;
		/** Container height in pixels */
		height?: number;
		/** Show annotation tracks */
		showAnnotations?: boolean;
		/** Show translation tracks */
		showTranslations?: boolean;
		/** Show position numbers */
		showNumbers?: boolean;
		/** Show complement strand */
		showComplement?: boolean;
		/** Color bases */
		colorBases?: boolean;
		/** Sequence topology (circular allows wrapping cut site selection) */
		topology?: 'circular' | 'linear';
		/** Selection callback */
		onselect?: (selection: { start: number; end: number; sequence: string }) => void;
		/** Part click callback */
		onpartclick?: (part: Part) => void;
		/** Copy sequence callback */
		oncopysequence?: (sequence: string) => void;
		/** Hover info callback */
		onhoverinfo?: (info: HoverInfo | null) => void;
	}

	let {
		data,
		seq: seqProp,
		parts: partsProp,
		cutSites: cutSitesProp,
		translations: translationsProp,
		selectionState,
		charsPerRow: charsPerRowProp,
		charWidth = 10,
		width = 700,
		height = 500,
		showAnnotations = true,
		showTranslations = true,
		showNumbers = true,
		showComplement = true,
		colorBases = false,
		topology: topologyProp,
		onselect,
		onpartclick,
		oncopysequence,
		onhoverinfo,
	}: Props = $props();

	const seq = $derived(seqProp ?? data?.seq ?? '');
	const parts = $derived(partsProp ?? data?.parts ?? []);
	const cutSites = $derived(cutSitesProp ?? data?.cutSites ?? []);
	const translations = $derived(translationsProp ?? data?.translations ?? []);
	const topology = $derived(topologyProp ?? data?.topology ?? 'linear');

	/** Enrich primers with auto-detected binding regions and mismatches */
	let enrichedParts = $derived(
		parts.map(p => (isPrimer(p) && p.sequence) ? { ...p, ...analyzePrimerBinding(p, seq) } : p)
	);

	const SEQ_X = SEQ_PAD;

	const availableW = $derived(width - SEQ_PAD - SEQ_PAD);

	/** Auto-compute chars per row from width, then stretch charWidth to fill exactly */
	let charsPerRow = $derived(
		charsPerRowProp ?? Math.max(10, Math.floor(availableW / charWidth))
	);
	let effectiveCharWidth = $derived(
		charsPerRowProp ? charWidth : availableW / charsPerRow
	);
	/** Split the sequence into rows */
	const rows = $derived.by(() => {
		const result: { seq: string; start: number }[] = [];
		for (let i = 0; i < seq.length; i += charsPerRow) {
			result.push({
				seq: seq.slice(i, i + charsPerRow),
				start: i,
			});
		}
		return result;
	});

	/** Check if a row has any cut sites (including those whose whiskers extend into this row) */
	function rowHasCutSites(rowStart: number, rowEnd: number): boolean {
		return cutSites.some((cs) => {
			const csEnd = cutSiteEnd(cs);
			return cs.position < rowEnd && csEnd > rowStart;
		});
	}

	/** Count annotation lanes for a row (features only, no primers) */
	function countAnnotationLanes(rowStart: number, rowEnd: number): number {
		if (!showAnnotations) return 0;
		return countLanes(enrichedParts.filter((p) => !isPrimer(p) && p.start < rowEnd && p.end > rowStart));
	}

	/** Count primer lanes for a row */
	function countPrimerLanes(rowStart: number, rowEnd: number): number {
		if (!showAnnotations) return 0;
		return countLanes(enrichedParts.filter((p) => isPrimer(p) && p.start < rowEnd && p.end > rowStart));
	}

	/** Height of the inline position ruler */
	let RULER_HEIGHT = $derived(showNumbers ? 16 : 0);

	/** Compute estimated height per row based on visible tracks */
	function estimateRowHeight(rowStart: number, rowEnd: number): number {
		let h = RULER_HEIGHT + 14; // ruler + base sequence height

		if (showComplement) h += 14 + 2;

		const annotLanes = countAnnotationLanes(rowStart, rowEnd);
		if (annotLanes > 0) h += annotLanes * 18 + 4;

		const primerLanes = countPrimerLanes(rowStart, rowEnd);
		if (primerLanes > 0) h += primerLanes * 25 + 12;

		if (showTranslations) {
			const visTrans = translations.filter((t) => t.start < rowEnd && t.end > rowStart);
			if (visTrans.length > 0) h += 24;
		}

		// Add space for cut site enzyme labels above annotations
		if (rowHasCutSites(rowStart, rowEnd)) h += CUTSITE_LABEL_H;

		return h;
	}

	/** Calculate cumulative Y positions for each row */
	const rowPositions = $derived.by(() => {
		const positions: { y: number; height: number }[] = [];
		let currentY = 8;
		for (const row of rows) {
			const rowEnd = row.start + row.seq.length;
			const rowH = estimateRowHeight(row.start, rowEnd);
			positions.push({ y: currentY, height: rowH });
			currentY += rowH + ROW_PADDING;
		}
		return positions;
	});

	const totalSvgHeight = $derived.by(() => {
		if (rowPositions.length === 0) return height;
		const last = rowPositions[rowPositions.length - 1];
		return last.y + last.height + ROW_PADDING;
	});

	const svgWidth = $derived(SEQ_PAD + charsPerRow * effectiveCharWidth + SEQ_PAD);

	/** Virtual scrolling state */
	let scrollTop = $state(0);
	let containerEl: HTMLDivElement | undefined = $state(undefined);

	function handleScroll() {
		if (containerEl) scrollTop = containerEl.scrollTop;
	}

	/** Compute visible row indices based on scroll position */
	const visibleRange = $derived.by(() => {
		if (rows.length === 0) return { start: 0, end: 0 };
		const viewTop = scrollTop;
		const viewBottom = scrollTop + height;
		let startIdx = 0;
		let endIdx = rows.length;
		for (let i = 0; i < rowPositions.length; i++) {
			if (rowPositions[i].y + rowPositions[i].height >= viewTop) {
				startIdx = Math.max(0, i - BUFFER_ROWS);
				break;
			}
		}
		for (let i = startIdx; i < rowPositions.length; i++) {
			if (rowPositions[i].y > viewBottom) {
				endIdx = Math.min(rows.length, i + BUFFER_ROWS);
				break;
			}
		}
		return { start: startIdx, end: endIdx };
	});

	/* Selection state — use SelectionState if provided, otherwise internal */
	let internalSelStart = $state(-1);
	let internalSelEnd = $state(-1);
	let isSelecting = $state(false);

	const selRange = $derived.by(() => {
		if (selectionState) return selectionState.range;
		if (internalSelStart < 0 || internalSelEnd < 0) return null;
		return {
			start: Math.min(internalSelStart, internalSelEnd),
			end: Math.max(internalSelStart, internalSelEnd) + 1,
		};
	});

	const caretPos = $derived.by(() => {
		if (selectionState) return selectionState.caretPosition;
		if (internalSelStart >= 0 && internalSelStart === internalSelEnd) return internalSelStart;
		return -1;
	});

	function bpFromSvgCoords(mouseX: number, mouseY: number): number {
		for (let i = 0; i < rows.length; i++) {
			const rp = rowPositions[i];
			if (mouseY >= rp.y && mouseY <= rp.y + rp.height) {
				const charIndex = Math.floor((mouseX - SEQ_X) / effectiveCharWidth);
				if (charIndex >= 0 && charIndex < rows[i].seq.length) {
					return rows[i].start + charIndex;
				}
			}
		}
		return -1;
	}

	function svgCoordsFromEvent(e: MouseEvent): { x: number; y: number } | null {
		const svgEl = containerEl?.querySelector('svg');
		if (!svgEl) return null;
		const rect = svgEl.getBoundingClientRect();
		// tbdb.tandem vendor adaptation: the host (TandemArchitecture) renders this viewer inside a
		// CSS-`zoom`ed wrapper to magnify the fixed-12px glyphs, so getBoundingClientRect() reports the
		// POST-zoom on-screen size while the SVG's geometry (rowPositions, effectiveCharWidth) is in
		// unscaled user units. Divide the rect-relative offset by the actual rendered scale to recover
		// user space — derived from the element itself, so it is correct under any scaling (CSS zoom,
		// transform, devicePixelRatio). The zoom is uniform, so the single width-derived scale serves
		// both axes; seqPointerScale guards the first-paint / zero-width case (returns 1).
		const scale = seqPointerScale(rect.width, svgWidth);
		return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
	}

	function handleMouseDown(e: MouseEvent) {
		const coords = svgCoordsFromEvent(e);
		if (!coords) return;
		const bp = bpFromSvgCoords(coords.x, coords.y);
		if (bp >= 0) {
			if (selectionState) {
				selectionState.startDrag(bp);
			} else {
				internalSelStart = bp;
				internalSelEnd = bp;
			}
			isSelecting = true;
			window.addEventListener('mousemove', handleWindowMouseMove);
			window.addEventListener('mouseup', handleWindowMouseUp);
		}
	}

	function handleWindowMouseMove(e: MouseEvent) {
		if (!isSelecting) return;
		const coords = svgCoordsFromEvent(e);
		if (!coords) return;
		const bp = bpFromSvgCoords(coords.x, coords.y);
		if (bp >= 0) {
			if (selectionState) {
				selectionState.updateDragLinear(bp);
			} else {
				internalSelEnd = bp;
			}
		}
	}

	function handleWindowMouseUp() {
		if (isSelecting) {
			isSelecting = false;
			window.removeEventListener('mousemove', handleWindowMouseMove);
			window.removeEventListener('mouseup', handleWindowMouseUp);
			if (selectionState) {
				selectionState.endDrag();
				const range = selectionState.range;
				if (range) {
					const selSeq = range.start <= range.end
						? seq.slice(range.start, range.end)
						: seq.slice(range.start) + seq.slice(0, range.end);
					onselect?.({ start: range.start, end: range.end, sequence: selSeq });
				}
			} else {
				if (internalSelStart >= 0 && internalSelEnd >= 0 && internalSelStart !== internalSelEnd) {
					const sStart = Math.min(internalSelStart, internalSelEnd);
					const sEnd = Math.max(internalSelStart, internalSelEnd) + 1;
					onselect?.({ start: sStart, end: sEnd, sequence: seq.slice(sStart, sEnd) });
				}
			}
		}
	}

	/** Whether the selection wraps around origin (start > end) */
	let selWraps = $derived(selRange ? selRange.start > selRange.end : false);

	/** Check if a linear [rowStart, rowEnd) overlaps the selection (handles wrapping) */
	function selOverlapsRow(rowStart: number, rowEnd: number): boolean {
		if (!selRange) return false;
		if (!selWraps) return selRange.start < rowEnd && selRange.end > rowStart;
		// Wrapping: selection covers [start, seqLen) + [0, end)
		return selRange.start < rowEnd || selRange.end > rowStart;
	}

	let selectionInfo = $derived.by(() => {
		if (!selRange) return '';
		let len = selRange.end - selRange.start;
		if (len === 0) return '';
		if (len < 0) len += seq.length; // wrapping
		const subseq = selWraps
			? (seq.slice(selRange.start) + seq.slice(0, selRange.end)).toUpperCase()
			: seq.slice(selRange.start, selRange.end).toUpperCase();
		let gc = 0;
		for (const ch of subseq) if (ch === 'G' || ch === 'C') gc++;
		const gcPct = ((gc / len) * 100).toFixed(1);
		let tm: string;
		if (len < 14) {
			tm = (2 * (len - gc) + 4 * gc).toFixed(0);
		} else {
			tm = (64.9 + 41 * (gc - 16.4) / len).toFixed(1);
		}
		return `${selRange.start + 1}..${selRange.end} (${len} bp) GC ${gcPct}% Tm ${tm}°C`;
	});

	function handlePartClick(part: Part) {
		onpartclick?.(part);
		if (selectionState) {
			selectionState.setSelection(part.start, part.end);
			onselect?.({ start: part.start, end: part.end, sequence: seq.slice(part.start, part.end) });
		}
	}

	function handlePartHover(part: Part | null, e?: MouseEvent) {
		if (!part || !e) { onhoverinfo?.(null); return; }
		onhoverinfo?.(buildPartHoverInfo(part, e));
	}

	function handleCutSiteHover(site: CutSite | null, e?: MouseEvent) {
		if (!site || !e) { onhoverinfo?.(null); return; }
		onhoverinfo?.(buildCutSiteHoverInfo(site, e));
	}

	/** Cluster nearby cut sites per row so dense MCS regions show "+N" */
	const CLUSTER_CHAR_DIST = 4;
	type SeqCutCluster = { primary: CutSite; enzymes: string[]; sites: CutSite[] };

	function clusterRowCutSites(rowStart: number, rowEnd: number): SeqCutCluster[] {
		const rowSites = cutSites
			.filter((cs) => {
				const csEnd = cutSiteEnd(cs);
				return cs.position < rowEnd && csEnd > rowStart;
			})
			.sort((a, b) => a.position - b.position);
		if (rowSites.length === 0) return [];

		const clusters: SeqCutCluster[] = [];
		let current: SeqCutCluster = { primary: rowSites[0], enzymes: [rowSites[0].enzyme], sites: [rowSites[0]] };

		for (let i = 1; i < rowSites.length; i++) {
			const charDist = rowSites[i].position - current.primary.position;
			if (charDist <= CLUSTER_CHAR_DIST) {
				current.enzymes.push(rowSites[i].enzyme);
				current.sites.push(rowSites[i]);
			} else {
				clusters.push(current);
				current = { primary: rowSites[i], enzymes: [rowSites[i].enzyme], sites: [rowSites[i]] };
			}
		}
		clusters.push(current);
		return clusters;
	}

	/** Clamp an X coordinate to the visible row area */
	function clampX(x: number, rowLen: number): number {
		return Math.max(SEQ_X, Math.min(x, SEQ_X + rowLen * effectiveCharWidth));
	}

	/** Get the full bp range for a cluster (first site start to last site end) */
	function clusterRange(cluster: SeqCutCluster): { start: number; end: number } {
		const first = cluster.sites[0];
		const last = cluster.sites[cluster.sites.length - 1];
		return { start: first.position, end: cutSiteEnd(last) };
	}

	function handleCutSiteClick(site: CutSite) {
		const s = site.position;
		const e = cutSiteEnd(site);
		if (selectionState) {
			selectionState.setSelection(s, e);
			onselect?.({ start: s, end: e, sequence: seq.slice(s, e) });
		} else {
			internalSelStart = s;
			internalSelEnd = e - 1;
		}
	}

	function handleClusterClick(cluster: SeqCutCluster) {
		const r = clusterRange(cluster);
		if (selectionState) {
			selectionState.setSelection(r.start, r.end);
			onselect?.({ start: r.start, end: r.end, sequence: seq.slice(r.start, r.end) });
		} else {
			internalSelStart = r.start;
			internalSelEnd = r.end - 1;
		}
	}

	function handleClusterHover(cluster: SeqCutCluster | null, e?: MouseEvent) {
		if (!cluster || !e) { onhoverinfo?.(null); return; }
		const r = clusterRange(cluster);
		onhoverinfo?.({
			title: cluster.enzymes.join(', '),
			items: [
				{ label: 'Enzymes', value: cluster.enzymes.length },
				{ label: 'Region', value: `${r.start}..${r.end}`, unit: 'bp' },
				...cluster.sites.map(s => ({ label: s.enzyme, value: s.position, unit: 'bp' })),
			],
			position: { x: e.clientX, y: e.clientY },
		});
	}

	/** Compute strand Y bounds WITHIN SequenceRow (relative to its own origin) */
	function strandBounds(rowStart: number, rowEnd: number): { seqY: number; endY: number; annotH: number } {
		const LINE_HEIGHT = 14;
		const annotLanes = countAnnotationLanes(rowStart, rowEnd);
		const primerLanes = countPrimerLanes(rowStart, rowEnd);
		const primerH = primerLanes > 0 ? primerLanes * 25 + 12 : 0;
		const annotH = RULER_HEIGHT + annotLanes * 18 + (annotLanes > 0 ? 4 : 0) + primerH;
		const csGap = rowHasCutSites(rowStart, rowEnd) ? CUTSITE_LABEL_H : 0;
		const seqY = annotH + csGap;
		const compY = seqY + LINE_HEIGHT + 2;
		const endY = showComplement ? compY + LINE_HEIGHT : seqY + LINE_HEIGHT;
		return { seqY, endY, annotH };
	}

	function rowFeatures(rowStart: number, rowEnd: number): Part[] {
		return enrichedParts.filter((p) => !isPrimer(p) && p.start < rowEnd && p.end > rowStart);
	}

	function rowPrimers(rowStart: number, rowEnd: number): Part[] {
		return enrichedParts.filter((p) => isPrimer(p) && p.start < rowEnd && p.end > rowStart);
	}

	function rowTranslations(rowStart: number, rowEnd: number): Translation[] {
		return translations.filter((t) => {
			const tEnd = t.start + t.aminoAcids.length * 3;
			return tEnd > rowStart && t.start < rowEnd;
		});
	}

	/** Auto-scroll to selection when it changes externally */
	$effect(() => {
		if (!selectionState || !containerEl) return;
		const range = selectionState.range;
		if (!range) return;
		const targetRow = Math.floor(range.start / charsPerRow);
		if (targetRow >= 0 && targetRow < rowPositions.length) {
			const rp = rowPositions[targetRow];
			const viewTop = containerEl.scrollTop;
			const viewBottom = viewTop + height;
			if (rp.y < viewTop || rp.y + rp.height > viewBottom) {
				containerEl.scrollTop = Math.max(0, rp.y - height / 3);
			}
		}
	});
</script>

<div
	class="hatch-sequence-viewer"
	style:width="{svgWidth}px"
	style:height={height ? `${height}px` : undefined}
	bind:this={containerEl}
	onscroll={handleScroll}
>
	{#if selectionInfo}
		<div class="selection-bar">
			Selection: {selectionInfo}
		</div>
	{/if}

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		width={svgWidth}
		height={totalSvgHeight}
		class="hatch-sequence-svg"
		role="application"
		aria-label="DNA sequence viewer"
		onmousedown={handleMouseDown}
	>
		{#each rows as row, i (row.start)}
			{#if i >= visibleRange.start && i < visibleRange.end}
				{@const rowEnd = row.start + row.seq.length}
				{@const rp = rowPositions[i]}
				{@const hasCutSites = rowHasCutSites(row.start, rowEnd)}

				<g transform="translate(0, {rp.y})">
					<!-- Selection highlight -->
					{#if selRange && selOverlapsRow(row.start, rowEnd)}
						{@const hlStart = selWraps
							? (row.start < selRange.end ? row.start : Math.max(selRange.start, row.start))
							: Math.max(selRange.start, row.start)}
						{@const hlEnd = selWraps
							? (rowEnd > selRange.start ? rowEnd : Math.min(selRange.end, rowEnd))
							: Math.min(selRange.end, rowEnd)}
						<rect
							x={SEQ_X + (hlStart - row.start) * effectiveCharWidth}
							y={0}
							width={(hlEnd - hlStart) * effectiveCharWidth}
							height={rp.height}
							fill="var(--hatch-selection-fill, rgba(0, 130, 250, 0.3))"
							rx="2"
						/>
						{#if hlStart === (selRange?.start ?? -1)}
							<rect
								x={SEQ_X + (hlStart - row.start) * effectiveCharWidth - 2}
								y={0}
								width="4"
								height={rp.height}
								fill="var(--hatch-selection-handle, rgba(0, 130, 250, 0.8))"
								rx="1"
								class="grab-handle"
							/>
						{/if}
						{#if hlEnd === (selRange?.end ?? -1)}
							<rect
								x={SEQ_X + (hlEnd - row.start) * effectiveCharWidth - 2}
								y={0}
								width="4"
								height={rp.height}
								fill="var(--hatch-selection-handle, rgba(0, 130, 250, 0.8))"
								rx="1"
								class="grab-handle"
							/>
						{/if}
					{/if}

					<!-- Blinking caret -->
					{#if caretPos >= row.start && caretPos < rowEnd}
						<line
							x1={SEQ_X + (caretPos - row.start) * effectiveCharWidth}
							y1={0}
							x2={SEQ_X + (caretPos - row.start) * effectiveCharWidth}
							y2={rp.height}
							stroke="var(--hatch-caret-color, #333)"
							stroke-width="1.5"
							class="caret-line"
						/>
					{/if}

					<!-- SequenceRow (cutsiteGap pushes sequence below annotation+label zone) -->
					<SequenceRow
						seq={row.seq}
						start={row.start}
						parts={rowFeatures(row.start, rowEnd)}
						primers={rowPrimers(row.start, rowEnd)}
						translations={rowTranslations(row.start, rowEnd)}
						charWidth={effectiveCharWidth}
						{showNumbers}
						{showAnnotations}
						{showTranslations}
						{showComplement}
						{colorBases}
						cutsiteGap={hasCutSites ? CUTSITE_LABEL_H : 0}
						onpartclick={handlePartClick}
						onparthover={handlePartHover}
					/>

					<!-- Cut site markers — all positions visible, labels clustered -->
					{#if hasCutSites}
					{@const sb = strandBounds(row.start, rowEnd)}
					{@const clusters = clusterRowCutSites(row.start, rowEnd)}
					{#each clusters as cluster (cluster.primary.id ?? cluster.primary.enzyme + cluster.primary.position)}
						{@const cr = clusterRange(cluster)}
						{@const visStart = Math.max(cr.start, row.start)}
						{@const visEnd = Math.min(cr.end, rowEnd)}
						{@const bgLeftX = SEQ_X + (visStart - row.start) * effectiveCharWidth}
						{@const bgRightX = SEQ_X + (visEnd - row.start) * effectiveCharWidth}
						{@const labelX = (bgLeftX + bgRightX) / 2}
						{@const labelY = sb.annotH + CUTSITE_LABEL_H / 2}
						{@const whiskerTop = sb.seqY}
						{@const whiskerBot = sb.endY}
						{@const labelText = cluster.enzymes.length === 1 ? cluster.primary.enzyme : cluster.primary.enzyme + ' +' + (cluster.enzymes.length - 1)}
						{@const showLabel = cluster.primary.position >= row.start && cluster.primary.position < rowEnd}
						<!-- svelte-ignore a11y_mouse_events_have_key_events -->
						<g
							class="cutsite-marker"
							role="button"
							tabindex="-1"
							onmouseover={(e) => cluster.sites.length > 1 ? handleClusterHover(cluster, e) : handleCutSiteHover(cluster.primary, e)}
							onmouseout={() => cluster.sites.length > 1 ? handleClusterHover(null) : handleCutSiteHover(null)}
							onclick={(e) => { e.stopPropagation(); cluster.sites.length > 1 ? handleClusterClick(cluster) : handleCutSiteClick(cluster.primary); }}
							onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); cluster.sites.length > 1 ? handleClusterClick(cluster) : handleCutSiteClick(cluster.primary); } }}
						>
							<!-- Semi-transparent background matching the selection area -->
							<rect
								x={bgLeftX}
								y={sb.annotH}
								width={bgRightX - bgLeftX}
								height={whiskerBot - sb.annotH}
								class="cutsite-bg"
								rx="2"
							/>
							<!-- Clustered label (only on the row where the primary site starts) -->
							{#if showLabel}
								<text
									x={labelX}
									y={labelY}
									text-anchor="middle"
									dominant-baseline="middle"
									fill="var(--hatch-cutsite-text, #d45858)"
									font-size={FONT_SECONDARY}
									font-family="var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace)"
									class="cutsite-label"
								>{labelText}</text>
							{/if}
							<!-- Whisker lines for EVERY site in the cluster, clamped to row -->
							{#each cluster.sites as cs, ci (cs.id ?? cs.enzyme + cs.position + ':' + ci)}
								{@const topCut = cs.cutPosition ?? 0}
								{@const botCut = cs.complementCutPosition ?? 0}
								{@const isSticky = topCut !== botCut}
								{@const rawTopX = SEQ_X + (cs.position - row.start + topCut) * effectiveCharWidth}
								{@const rawBotX = SEQ_X + (cs.position - row.start + botCut) * effectiveCharWidth}
								{@const topX = clampX(rawTopX, row.seq.length)}
								{@const botX = clampX(rawBotX, row.seq.length)}
								{@const midY = (whiskerTop + whiskerBot) / 2}
								{#if isSticky}
									<line x1={topX} y1={whiskerTop} x2={topX} y2={midY} stroke="var(--hatch-cutsite-color, #d45858)" stroke-width="1" stroke-opacity="0.6" />
									<line x1={topX} y1={midY} x2={botX} y2={midY} stroke="var(--hatch-cutsite-color, #d45858)" stroke-width="1" stroke-opacity="0.6" />
									<line x1={botX} y1={midY} x2={botX} y2={whiskerBot} stroke="var(--hatch-cutsite-color, #d45858)" stroke-width="1" stroke-opacity="0.6" />
								{:else}
									<line x1={topX} y1={whiskerTop} x2={topX} y2={whiskerBot} stroke="var(--hatch-cutsite-color, #d45858)" stroke-width="1" stroke-opacity="0.5" />
								{/if}
							{/each}
						</g>
					{/each}
					{/if}
				</g>
			{/if}
		{/each}
	</svg>
</div>

<style>
	.hatch-sequence-viewer {
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--hatch-bg, #0c1018);
		position: relative;
		cursor: text;
		user-select: none;
	}

	.hatch-sequence-svg {
		display: block;
	}

	.selection-bar {
		position: sticky;
		top: 4px;
		float: right;
		z-index: 10;
		padding: 2px 8px;
		margin-right: 4px;
		margin-bottom: -20px;
		border-radius: 3px;
		background: var(--hatch-bg, rgba(12, 16, 24, 0.85));
		color: var(--hatch-highlight, #6ab8e0);
		font-size: 10px;
		font-family: var(--hatch-font-mono, 'SF Mono', 'Fira Code', monospace);
		pointer-events: none;
	}

	.caret-line {
		animation: blink 1s step-end infinite;
	}

	@keyframes blink {
		50% { opacity: 0; }
	}

	.grab-handle {
		cursor: ew-resize;
		opacity: 0.8;
	}

	.cutsite-marker {
		cursor: pointer;
	}

	.cutsite-bg {
		fill: var(--hatch-cutsite-bg, rgba(212, 88, 88, 0.06));
		stroke: none;
		transition: fill 0.15s;
	}

	.cutsite-marker:hover .cutsite-bg {
		fill: var(--hatch-cutsite-bg-hover, rgba(212, 88, 88, 0.15));
	}

	.cutsite-marker:hover line {
		stroke-opacity: 1;
		stroke-width: 1.5;
	}

	.cutsite-marker:hover .cutsite-label {
		font-weight: 700;
	}
</style>
