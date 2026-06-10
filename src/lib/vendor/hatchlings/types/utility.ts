/** Types for shared components */

// Tooltip
export interface InfoItem {
	label: string;
	value: string | number;
	unit?: string;
	color?: string;
}

export interface HoverInfo {
	title: string;
	items: InfoItem[];
	position: { x: number; y: number };
}
