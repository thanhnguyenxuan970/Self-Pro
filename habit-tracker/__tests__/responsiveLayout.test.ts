import { getCalendarLayout } from '../src/utils/calendarLayout';
import { getCoachmarkPosition } from '../src/utils/coachmarkLayout';

describe('responsive calendar layout', () => {
  it.each([320, 360, 411, 600])('keeps seven columns inside a %ipx content width', (windowWidth) => {
    const layout = getCalendarLayout(windowWidth);
    const gridWidth = windowWidth - layout.horizontalPadding * 2;
    const usedWidth = layout.cellSize * 7 + layout.cellGap * 6;

    expect(usedWidth).toBeLessThanOrEqual(gridWidth);
    expect(layout.cellSize).toBeGreaterThanOrEqual(28);
  });

  it('uses compact typography for narrow and enlarged-font layouts', () => {
    const regular = getCalendarLayout(411);
    const narrow = getCalendarLayout(320);
    const enlarged = getCalendarLayout(411, 1.3);

    expect(narrow.cellSize).toBeLessThan(regular.cellSize);
    expect(narrow.dayFontSize).toBeLessThan(regular.dayFontSize);
    expect(enlarged.summaryLabelSize).toBeLessThan(regular.summaryLabelSize);
  });
});

describe('responsive coachmark layout', () => {
  it('shrinks the tooltip without crossing narrow-screen edges', () => {
    const position = getCoachmarkPosition(null, 300, 800, 176, 24, 16);

    expect(position.tipWidth).toBe(268);
    expect(position.tipLeft).toBe(16);
    expect(position.tipLeft + position.tipWidth).toBeLessThanOrEqual(300);
  });

  it('clamps a tooltip away from the bottom tab bar when a target is low', () => {
    const position = getCoachmarkPosition(
      { x: 12, y: 700, width: 276, height: 72 },
      320,
      800,
      176,
      24,
      16,
    );

    expect(position.tipTop).toBeGreaterThanOrEqual(32);
    expect(position.tipTop + 176).toBeLessThanOrEqual(800 - 64 - 16 - 8);
  });
});
