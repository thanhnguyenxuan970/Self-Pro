import { ACCENTS } from '../src/config/accents';

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
});
