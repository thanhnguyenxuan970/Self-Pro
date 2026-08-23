import { getAppButtonAccessibilityState, getAppButtonPresentation, getBottomSheetAnimationType } from '../src/components/uiPrimitives';

describe('AppButton', () => {
  test('disables the control while loading and preserves existing accessibility state', () => {
    expect(getAppButtonAccessibilityState({ selected: true }, false, true)).toEqual({
      selected: true,
      disabled: true,
      busy: true,
    });
  });

  test('uses the requested visual variant and supports a two-line label', () => {
    expect(getAppButtonPresentation('secondary', false, false)).toEqual({
      variant: 'secondary',
      disabled: false,
      numberOfLines: 2,
    });
  });
});

describe('BottomSheetFrame', () => {
  test('removes entrance motion when reduced motion is enabled', () => {
    expect(getBottomSheetAnimationType(true)).toBe('none');
    expect(getBottomSheetAnimationType(false)).toBe('slide');
  });
});
