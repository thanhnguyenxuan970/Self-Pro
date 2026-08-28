export interface CoachmarkTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoachmarkPosition {
  tipTop: number;
  tipLeft: number;
  tipWidth: number;
}

export const COACHMARK_GAP = 24;
export const COACHMARK_SIDE_INSET = 16;
export const COACHMARK_MAX_WIDTH = 280;
export const COACHMARK_TAB_BAR_HEIGHT = 64;
export const COACHMARK_FALLBACK_HEIGHT = 176;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculates a bounded tooltip position for both portrait and compact
 * windows. The returned top is always kept clear of the safe-area edges and
 * the bottom tab bar, even when the highlighted target is partly off-screen.
 */
export function getCoachmarkPosition(
  rect: CoachmarkTargetRect | null,
  windowWidth: number,
  windowHeight: number,
  measuredTipHeight: number,
  topInset = 0,
  bottomInset = 0,
): CoachmarkPosition {
  const width = Math.max(0, Number.isFinite(windowWidth) ? windowWidth : 0);
  const height = Math.max(0, Number.isFinite(windowHeight) ? windowHeight : 0);
  const tipHeight = Math.max(1, Number.isFinite(measuredTipHeight) ? measuredTipHeight : COACHMARK_FALLBACK_HEIGHT);
  const tipWidth = Math.min(COACHMARK_MAX_WIDTH, Math.max(0, width - COACHMARK_SIDE_INSET * 2));
  const tipLeft = Math.max(0, (width - tipWidth) / 2);
  const minTop = Math.max(8, Math.max(0, topInset) + 8);
  const minBottom = COACHMARK_TAB_BAR_HEIGHT + Math.max(0, bottomInset) + 8;
  const maxTop = Math.max(minTop, height - minBottom - tipHeight);
  const clampTop = (top: number) => clamp(top, minTop, maxTop);

  if (!rect) {
    return {
      tipTop: clampTop(height / 2 - tipHeight / 2),
      tipLeft,
      tipWidth,
    };
  }

  const spaceBelow = height - (rect.y + rect.height) - minBottom - COACHMARK_GAP;
  const spaceAbove = rect.y - minTop - COACHMARK_GAP;
  const desiredTop = spaceBelow >= tipHeight
    ? rect.y + rect.height + COACHMARK_GAP
    : spaceAbove >= tipHeight
      ? rect.y - tipHeight - COACHMARK_GAP
      : rect.y > height / 2
        ? rect.y - tipHeight - COACHMARK_GAP
        : rect.y + rect.height + COACHMARK_GAP;

  return {
    tipTop: clampTop(desiredTop),
    tipLeft,
    tipWidth,
  };
}
