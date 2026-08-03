import { BOOST_EXPIRING_THRESHOLD_SECS, STARS_PER_TASK } from '../config/constants';
import type { AppColors } from '../config/theme';

export type BoostPhase = 'none' | 'available' | 'active' | 'expiring' | 'expired';

export type BoostPalette = { fill: string; border: string; ink: string };

export function boostPalette(colors: AppColors): BoostPalette {
  return { fill: colors.primary, border: colors.primaryPress, ink: colors.onAccent };
}

export type BoostEventRow = {
  multiplier: number;
  claim_deadline: number; // availability deadline, ms epoch
  claimed_at: number | null;
  expires_at: number | null;
  dismissed_at: number | null;
};

export type BoostLogRow = { source: string; kind: string; stars_delta: number };

export type BoostSummary = {
  boostStars: number;
  boostLogs: number;
  baseStars: number;
  bonusStars: number;
  totalStars: number;
};

/**
 * Pure function of (now, event) rather than accumulated state — a suspended
 * timer or a backgrounded app self-corrects the instant it next evaluates,
 * with no drift or manual "catch up" step.
 */
export function deriveBoostPhase(nowMs: number, event: BoostEventRow | null): BoostPhase {
  if (!event) return 'none';
  if (event.claimed_at === null) {
    if (event.dismissed_at !== null) return 'none';
    // A received boost stays available until its local-day deadline.
    // Activation, not receipt, starts the multiplier window.
    return nowMs < event.claim_deadline ? 'available' : 'none';
  }
  const expiresAt = event.expires_at ?? event.claimed_at;
  if (nowMs >= expiresAt) return 'expired';
  const secsLeft = Math.floor((expiresAt - nowMs) / 1000);
  return secsLeft <= BOOST_EXPIRING_THRESHOLD_SECS ? 'expiring' : 'active';
}

export function nextBoostPhaseAt(nowMs: number, event: BoostEventRow | null): number | null {
  if (!event || event.dismissed_at !== null) return null;
  if (event.claimed_at === null) return event.claim_deadline > nowMs ? event.claim_deadline : null;
  const expiresAt = event.expires_at ?? event.claimed_at;
  if (nowMs >= expiresAt) return null;
  const expiringAt = expiresAt - BOOST_EXPIRING_THRESHOLD_SECS * 1000;
  return nowMs < expiringAt ? expiringAt : expiresAt;
}

/** Whether a log landing at `loggedAtMs` should be multiplied. Ignores
 * dismissed_at — dismissal only hides the already-expired summary sheet,
 * it never revokes stars already earned inside a still-open window. */
export function isBoostActiveAt(loggedAtMs: number, event: BoostEventRow | null): boolean {
  if (!event || event.claimed_at === null || event.expires_at === null) return false;
  return loggedAtMs >= event.claimed_at && loggedAtMs < event.expires_at;
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
  const safeSecs = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(safeSecs / 3600);
  const m = Math.floor((safeSecs % 3600) / 60);
  const s = safeSecs % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function summarizeBoostLogs(logs: BoostLogRow[], baseStarsPerLog = STARS_PER_TASK): BoostSummary {
  const boostedLogs = logs.filter(row => row.source === 'TASK' && row.kind === 'GOOD' && row.stars_delta > 0);
  const boostStars = boostedLogs.reduce((total, row) => total + row.stars_delta, 0);
  const boostLogs = boostedLogs.length;
  const baseStars = boostLogs * baseStarsPerLog;
  const bonusStars = Math.max(0, boostStars - baseStars);
  return { boostStars, boostLogs, baseStars, bonusStars, totalStars: boostStars };
}
