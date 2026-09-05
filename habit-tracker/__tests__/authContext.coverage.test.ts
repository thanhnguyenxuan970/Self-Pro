jest.mock('react', () => ({
  createContext: (defaultValue: unknown) => ({ defaultValue }),
  useContext: (context: { defaultValue: unknown }) => context.defaultValue,
}));

import { useAuthUser, useGoogleUser } from '../src/hooks/authContext';

test('auth context hooks return their safe defaults outside a provider', () => {
  expect(useAuthUser()).toBe(1);
  expect(useGoogleUser()).toBeNull();
});
