import { createContext, useContext } from 'react';
import type { GoogleUser } from '../lib/googleUserStorage';

export const UserIdContext = createContext<number>(1);

export function useAuthUser(): number {
  return useContext(UserIdContext);
}

export const GoogleUserContext = createContext<GoogleUser | null>(null);

export function useGoogleUser(): GoogleUser | null {
  return useContext(GoogleUserContext);
}
