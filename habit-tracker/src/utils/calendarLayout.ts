export type CalendarLayout = {
  horizontalPadding: number;
  cellSize: number;
  cellGap: number;
  dayFontSize: number;
  dayLineHeight: number;
  cellIconSize: number;
  cellIconLineHeight: number;
  cellTopPadding: number;
  cellBottomPadding: number;
  cellBottomHeight: number;
  dowFontSize: number;
  monthFontSize: number;
  legendFontSize: number;
  summaryValueSize: number;
  summaryLabelSize: number;
  summaryLabelLineHeight: number;
};

const MIN_HORIZONTAL_PADDING = 12;
const DEFAULT_HORIZONTAL_PADDING = 16;
const MIN_CELL_GAP = 2;
const MAX_CELL_GAP = 6;
const MIN_CELL_SIZE = 28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps the seven-column calendar usable on narrow phones without allowing
 * the day cells to grow disproportionately on larger screens.
 */
export function getCalendarLayout(windowWidth: number, fontScale = 1): CalendarLayout {
  const safeWidth = Number.isFinite(windowWidth) ? Math.max(0, windowWidth) : 0;
  const horizontalPadding = safeWidth < 360 ? MIN_HORIZONTAL_PADDING : DEFAULT_HORIZONTAL_PADDING;
  const gridWidth = Math.max(7 * MIN_CELL_SIZE + 6 * MIN_CELL_GAP, safeWidth - horizontalPadding * 2);
  const cellGap = clamp(Math.round(gridWidth * 0.012), MIN_CELL_GAP, MAX_CELL_GAP);
  const cellSize = Math.max(MIN_CELL_SIZE, Math.floor((gridWidth - cellGap * 6) / 7));
  const compact = cellSize < 40 || fontScale > 1.15;

  return {
    horizontalPadding,
    cellSize,
    cellGap,
    dayFontSize: compact ? 13 : 15,
    dayLineHeight: compact ? 15 : 18,
    cellIconSize: compact ? 10 : 12,
    cellIconLineHeight: compact ? 12 : 15,
    cellTopPadding: compact ? 2 : 6,
    cellBottomPadding: compact ? 2 : 5,
    cellBottomHeight: compact ? 10 : 16,
    dowFontSize: compact ? 11 : 12,
    monthFontSize: compact ? 15 : 16,
    legendFontSize: compact ? 11 : 12,
    summaryValueSize: compact ? 16 : 18,
    summaryLabelSize: compact ? 10.5 : 11,
    summaryLabelLineHeight: compact ? 14 : 16,
  };
}
