import { validateDeposit } from '../src/logic/fundDeposit';

describe('validateDeposit', () => {
  test('positive amount → valid', () => expect(validateDeposit(50000).valid).toBe(true));
  test('zero → invalid', () => expect(validateDeposit(0).valid).toBe(false));
  test('negative → invalid', () => expect(validateDeposit(-1000).valid).toBe(false));
  test('NaN → invalid', () => expect(validateDeposit(NaN).valid).toBe(false));
  test('exceeds max → invalid', () => expect(validateDeposit(200_000_001).valid).toBe(false));
  test('error message on zero', () => expect(validateDeposit(0).error).toBeTruthy());
});
