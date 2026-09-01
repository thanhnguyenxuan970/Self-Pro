import { Spacing } from '../config/theme';

const HEATMAP_CELL_SIZE = 14;
const HEATMAP_CELL_GAP = 4;
const HOME_REFERENCE_WIDTH = 411;
const HOME_MIN_LAYOUT_SCALE = 0.82;

export type HomeHeatmapLayout = {
  compactHeader: boolean;
  cardMarginHorizontal: number;
  cardPaddingHorizontal: number;
  cellSize: number;
  cellGap: number;
  cellPitch: number;
  totalSize: number;
  totalLineHeight: number;
  totalLabelSize: number;
  totalLabelLineHeight: number;
  totalLabelMaxWidth: number;
  yearSize: number;
  rewardPaddingHorizontal: number;
  rewardPaddingVertical: number;
  rewardSize: number;
};

export function getHomeHeatmapLayout(width: number): HomeHeatmapLayout {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : HOME_REFERENCE_WIDTH;
  const scale = Math.max(HOME_MIN_LAYOUT_SCALE, Math.min(1, safeWidth / HOME_REFERENCE_WIDTH));
  const cellSize = Math.max(12, Math.round(HEATMAP_CELL_SIZE * scale));
  const cellGap = Math.max(3, Math.round(HEATMAP_CELL_GAP * scale));

  return {
    compactHeader: safeWidth < 360,
    cardMarginHorizontal: Math.round(Spacing.lg * scale),
    cardPaddingHorizontal: Math.round(24 * scale),
    cellSize,
    cellGap,
    cellPitch: cellSize + cellGap,
    totalSize: Math.max(38, Math.round(48 * scale)),
    totalLineHeight: Math.max(46, Math.round(56 * scale)),
    totalLabelSize: Math.max(12, Math.round(16 * scale)),
    totalLabelLineHeight: Math.max(16, Math.round(20 * scale)),
    totalLabelMaxWidth: Math.max(92, Math.round(128 * scale)),
    yearSize: Math.max(13, Math.round(16 * scale)),
    rewardPaddingHorizontal: Math.max(12, Math.round(14 * scale)),
    rewardPaddingVertical: Math.max(7, Math.round(8 * scale)),
    rewardSize: Math.max(14, Math.round(15 * scale)),
  };
}
