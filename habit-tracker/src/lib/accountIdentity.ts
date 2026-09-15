/** Canonical local/remote ownership key for the current email-based auth model. */
export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function requireNormalizedAccountEmail(email: string): string {
  const normalized = normalizeAccountEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+$/.test(normalized)) {
    throw new Error('A valid stable account key is required');
  }
  return normalized;
}
