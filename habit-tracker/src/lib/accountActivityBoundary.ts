import { normalizeAccountEmail } from './accountIdentity';

/**
 * The named `thanguyenxuan` account has a confirmed real-activity start date.
 * Keep this boundary account-scoped so QA fixtures and other users retain their
 * complete history.
 */
export const THANGUYENXUAN_EMAIL = 'thanhnguyenxuan970@gmail.com';
export const THANGUYENXUAN_ACTIVITY_START_DATE = '2026-07-06';

export function getAccountActivityStartDate(userEmail: string | null | undefined): string | null {
  return userEmail != null && normalizeAccountEmail(userEmail) === THANGUYENXUAN_EMAIL
    ? THANGUYENXUAN_ACTIVITY_START_DATE
    : null;
}

export function isActivityDateIncluded(localDate: string, startDate: string | null): boolean {
  return startDate === null || localDate >= startDate;
}

export function filterRowsByActivityStartDate<T extends { local_date?: unknown }>(
  rows: readonly T[],
  startDate: string | null,
): T[] {
  if (startDate === null) return [...rows];
  return rows.filter(row => typeof row.local_date === 'string' && isActivityDateIncluded(row.local_date, startDate));
}

export function sumPositiveStarsFromRows(
  rows: readonly { stars_delta?: unknown }[],
): number {
  return rows.reduce((total, row) => {
    const stars = typeof row.stars_delta === 'number' && Number.isFinite(row.stars_delta)
      ? row.stars_delta
      : 0;
    return total + Math.max(0, stars);
  }, 0);
}
