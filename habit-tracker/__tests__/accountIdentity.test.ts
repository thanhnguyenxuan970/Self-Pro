import {
  normalizeAccountEmail,
  requireNormalizedAccountEmail,
} from '../src/lib/accountIdentity';

describe('account identity', () => {
  it('normalizes a stable email account key', () => {
    expect(normalizeAccountEmail('  Test.User@Example.COM ')).toBe('test.user@example.com');
    expect(requireNormalizedAccountEmail('  Test.User@Example.COM ')).toBe('test.user@example.com');
  });

  it.each(['', 'missing-at.example.com', 'two@@example.com', 'space @example.com'])(
    'rejects an unstable account key: %j',
    (value) => {
      expect(() => requireNormalizedAccountEmail(value)).toThrow(
        'A valid stable account key is required',
      );
    },
  );
});
