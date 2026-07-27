import { BOOST_CLAIM_DEADLINE_HOUR, BOOST_EXPIRING_THRESHOLD_SECS, BOOST_RARE_CHANCE } from '../config/constants';

export type BoostPhase = 'none' | 'available' | 'active' | 'expiring' | 'expired';

export type BoostEventRow = {
  multiplier: number;
  claim_deadline: number; // ms epoch
  claimed_at: number | null;
  expires_at: number | null;
  dismissed_at: number | null;
};

/**
 * Pure function of (now, event) rather than accumulated state — a suspended
 * timer or a backgrounded app self-corrects the instant it next evaluates,
 * with no drift or manual "catch up" step.
 */
export function deriveBoostPhase(nowMs: number, event: BoostEventRow | null): BoostPhase {
  if (!event || event.dismissed_at !== null) return 'none';
  if (event.claimed_at === null) {
    return nowMs < event.claim_deadline ? 'available' : 'none';
  }
  const expiresAt = event.expires_at ?? event.claimed_at;
  if (nowMs >= expiresAt) return 'expired';
  const secsLeft = Math.floor((expiresAt - nowMs) / 1000);
  return secsLeft <= BOOST_EXPIRING_THRESHOLD_SECS ? 'expiring' : 'active';
}

/** Whether a log landing at `loggedAtMs` should be multiplied. Ignores
 * dismissed_at — dismissal only hides the already-expired summary sheet,
 * it never revokes stars already earned inside a still-open window. */
export function isBoostActiveAt(loggedAtMs: number, event: BoostEventRow | null): boolean {
  if (!event || event.claimed_at === null || event.expires_at === null) return false;
  return loggedAtMs < event.expires_at;
}

export function rollBoostMultiplier(rand: () => number = Math.random): 2 | 3 {
  return rand() < BOOST_RARE_CHANCE ? 3 : 2;
}

/** Today's claim deadline (BOOST_CLAIM_DEADLINE_HOUR:00 local). */
export function boostClaimDeadlineMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(BOOST_CLAIM_DEADLINE_HOUR, 0, 0, 0);
  return d.getTime();
}

/** Local midnight starting the next day (Date auto-normalizes hour 24). */
export function boostEndOfDayMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function secsRemaining(nowMs: number, expiresAt: number | null): number {
  if (expiresAt === null) return 0;
  return Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
}

export function formatCountdown(totalSecs: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
