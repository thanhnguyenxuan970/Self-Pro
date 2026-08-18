export const NO_SAVED_GOOGLE_CREDENTIAL_CODE = 'NO_SAVED_GOOGLE_CREDENTIAL';

export class NoSavedGoogleCredentialError extends Error {
  // Read via a structural cast in useAuth.ts, invisible to static analysis.
  // fallow-ignore-next-line unused-class-member
  readonly code = NO_SAVED_GOOGLE_CREDENTIAL_CODE;

  constructor() {
    super('No saved Google credential to refresh the sync session');
    this.name = 'NoSavedGoogleCredentialError';
  }
}
