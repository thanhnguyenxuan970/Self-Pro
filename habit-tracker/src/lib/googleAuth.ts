import { GOOGLE_PICTURE_PLACEHOLDER, type GoogleUser } from './googleUserStorage';

export type GoogleSignInResponse = {
  type?: string;
  data?: {
    user?: {
      email?: string;
      name?: string;
      id?: string;
      photo?: string | null;
    };
    idToken?: string | null;
  } | null;
};

export function isGoogleSignInCancelledResponse(response: GoogleSignInResponse | null | undefined): boolean {
  return response?.type === 'cancelled';
}

/** Convert the native Google response only when the remote-auth credential is present. */
export function extractGoogleUser(response: GoogleSignInResponse): { googleUser: GoogleUser; idToken: string } | null {
  const user = response.data?.user;
  const idToken = response.data?.idToken;
  if (
    typeof user?.id !== 'string' || !user.id.trim()
    || typeof user.email !== 'string' || !user.email.trim()
    || typeof user.name !== 'string' || !user.name.trim()
    || typeof idToken !== 'string' || !idToken.trim()
  ) return null;

  return {
    googleUser: {
      sub: user.id.trim(),
      email: user.email.trim(),
      name: user.name.trim(),
      picture: typeof user.photo === 'string' && user.photo.trim()
        ? user.photo.trim()
        : GOOGLE_PICTURE_PLACEHOLDER,
    },
    idToken: idToken.trim(),
  };
}
