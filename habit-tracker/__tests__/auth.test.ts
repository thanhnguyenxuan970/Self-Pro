import { parseOnboarded, parseGoogleUser } from '../src/hooks/useAuth';

describe('parseOnboarded', () => {
  test('null → false', () => expect(parseOnboarded(null)).toBe(false));
  test('"true" → true', () => expect(parseOnboarded('true')).toBe(true));
  test('"false" → false', () => expect(parseOnboarded('false')).toBe(false));
  test('empty string → false', () => expect(parseOnboarded('')).toBe(false));
});

describe('parseGoogleUser', () => {
  test('null → null', () => expect(parseGoogleUser(null)).toBeNull());
  test('invalid JSON → null', () => expect(parseGoogleUser('not-json')).toBeNull());
  test('missing email field → null', () =>
    expect(parseGoogleUser(JSON.stringify({ name: 'Test' }))).toBeNull());
  test('missing picture field → null', () =>
    expect(parseGoogleUser(JSON.stringify({ email: 'a@b.com', name: 'Test' }))).toBeNull());
  test('valid object with sub → GoogleUser', () => {
    const user = { sub: 'google-uid-123', email: 'a@b.com', name: 'Test User', picture: 'https://pic.jpg' };
    expect(parseGoogleUser(JSON.stringify(user))).toEqual(user);
  });
  test('legacy object without sub → falls back to email as sub', () => {
    const user = { email: 'a@b.com', name: 'Test User', picture: 'https://pic.jpg' };
    expect(parseGoogleUser(JSON.stringify(user))).toEqual({ sub: 'a@b.com', ...user });
  });
});
