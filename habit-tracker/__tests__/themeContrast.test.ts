import { ACCENTS, AccentKey } from '../src/config/accents';
import { getColors } from '../src/config/theme';

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + .05) / (dark + .05);
}

describe('accent contrast', () => {
  it('keeps accent-fill text readable in every light and dark palette', () => {
    for (const [name, accent] of Object.entries(ACCENTS)) {
      expect(contrast(accent.light.primary, accent.onAccent.light)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent.dark.primary, accent.onAccent.dark)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps semantic primary text readable on soft accent fills', () => {
    for (const name of Object.keys(ACCENTS) as AccentKey[]) {
      const light = getColors(false, name);
      const dark = getColors(true, name);
      expect(contrast(light.primaryText, light.primarySoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark.primaryText, dark.primarySoft)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps negative metric deltas readable on their primary metric surfaces', () => {
    for (const name of Object.keys(ACCENTS) as AccentKey[]) {
      const light = getColors(false, name);
      const dark = getColors(true, name);
      expect(contrast(light.dangerText, light.primarySoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark.dangerText, dark.surface2)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps semantic primary text readable on plain light and dark surfaces', () => {
    for (const name of Object.keys(ACCENTS) as AccentKey[]) {
      const light = getColors(false, name);
      const dark = getColors(true, name);
      expect(contrast(light.primaryText, light.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light.primaryText, light.bgBase)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark.primaryText, dark.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark.primaryText, dark.bgBase)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps analytic gold metric text readable on metric cards', () => {
    for (const name of Object.keys(ACCENTS) as AccentKey[]) {
      const light = getColors(false, name);
      const dark = getColors(true, name);
      expect(contrast(light.starGoldText, light.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark.starGoldText, dark.surface2)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
