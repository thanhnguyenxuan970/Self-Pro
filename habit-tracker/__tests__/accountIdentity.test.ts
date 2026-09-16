import { normalizeAccountEmail, requireNormalizedAccountEmail } from '../src/lib/accountIdentity';

describe('normalizeAccountEmail', () => {
  it.each([
    ['User@Example.com', 'user@example.com'],
    [' user@example.com ', 'user@example.com'],
    ['USER@EXAMPLE.COM', 'user@example.com'],
  ])('normalizes %p to the stable account key %p', (input, expected) => {
    expect(normalizeAccountEmail(input)).toBe(expected);
  });

  it.each(['', '   ', 'not-an-email', '@example.com', 'user@'])
  ('rejects invalid authenticated email %p', input => {
    expect(() => requireNormalizedAccountEmail(input)).toThrow('valid stable account key');
  });
});
