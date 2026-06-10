// ── Virtual Scroll ──
export const BUFFER_ROWS = 2;
export const ROW_PADDING = 4;

// ── Sequence Grid ──
export const SEQ_PAD = 12;

// ── Text Metrics (monospace at standard sizes) ──
export const CHAR_PX = 6;
export const CHAR_PX_SMALL = 5.5;

// ── Track Heights ──
export const LINE_HEIGHT = 14;
export const ANNOTATION_H = 16;
export const FEATURE_H = 14;
export const PRIMER_H = 8;
export const AA_BLOCK_H = 18;
export const CODON_H = 12;
export const CUTSITE_LABEL_H = 14;

// ── Gaps & Spacing ──
export const ANNOTATION_GAP = 2;
export const LANE_GAP = 3;
export const ZONE_GAP = 4;

// ── Font Sizes (two-tier system) ──
export const FONT_PRIMARY = 11;
export const FONT_SECONDARY = 8;

// ── Linear Map ──
export const LINEAR_MARGIN_LEFT = 20;
export const LINEAR_MARGIN_RIGHT = 20;
export const BACKBONE_STROKE = 1.5;
export const RULER_TICK = 4;
export const RULER_LABEL_GAP = 3;
export const RULER_LABEL_H = 8;
export const CUT_SITE_EXTEND = 8;
export const CUT_SITE_LABEL_H = 14;
export const LABEL_ROW_H = 12;
export const LINEAR_PADDING = 6;

// ── Plasmid (radial) ──
export const PART_WIDTH = 14;
export const PART_GAP = 4;
export const CUTSITE_SPACE = 14;
export const SCALE_BAND = 16;

// ── Chart Margins (default) ──
export const CHART_MARGIN = {
	top: 20,
	right: 20,
	bottom: 50,
	left: 60,
} as const;
