-- One-time correction: this account's lifetime_stars was inflated by a
-- seeded/mock value (~3000+) that predates real activity. sync_lifetime_stars()
-- and the local ensureLifetimeRankColumns backfill both compute
-- GREATEST(stored, activity-derived) -- a high-water mark that protects real
-- progress from ever decreasing, but has no path to un-stick a value that was
-- wrong from the start rather than merely stale. Account owner confirmed the
-- real total is ~252 as of 2026-08-13; reset it explicitly since the normal
-- sync path cannot. NOTE: this alone will not hold -- see 037, which removes
-- the confirmed-fake activity_log rows that would otherwise re-inflate this
-- back to ~484 on the very next sync.

UPDATE public.users
SET lifetime_stars = 252
WHERE user_email = 'thanhnguyenxuan970@gmail.com';
