import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type PromoSnapshot,
  promotionCountSteps,
  ranksClimbed,
  shouldAnimatePromotion,
} from '../lib/leaderboardPromotion';

const STEP_MS = 260;
const START_DELAY_MS = 320;

export type PromoState = { start: PromoSnapshot; target: PromoSnapshot };

/**
 * Drives the Rank Board's star-count climb: ticks `displayStars` from the
 * caller's previous total up to their current one whenever it rises between
 * renders (see `shouldAnimatePromotion`), and fires `onPromotionStart` once
 * the climb actually begins so the screen can scroll the caller's row into
 * view first — mirroring the source design's `runPromo`.
 */
export function useLeaderboardPromotion(
  me: PromoSnapshot | null,
  reduceMotion: boolean,
  onPromotionStart?: () => void,
  // Seeds the very first paint (before the real leaderboard entry exists)
  // with the best locally-known total, so cold start never flashes a 0
  // that a moment later corrects itself once `me` arrives.
  initialStars = 0,
) {
  const prevRef = useRef<PromoSnapshot | null>(null);
  const [displayStars, setDisplayStars] = useState(me?.stars ?? initialStars);
  const [promo, setPromo] = useState<PromoState | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onPromotionStartRef = useRef(onPromotionStart);
  onPromotionStartRef.current = onPromotionStart;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const runPromo = useCallback((start: PromoSnapshot, target: PromoSnapshot) => {
    clearTimers();
    setDisplayStars(start.stars);
    const steps = promotionCountSteps(start.stars, target.stars);
    if (steps.length === 0) return;
    timers.current.push(setTimeout(() => {
      onPromotionStartRef.current?.();
      steps.forEach((value, i) => {
        timers.current.push(setTimeout(() => setDisplayStars(value), (i + 1) * STEP_MS));
      });
    }, START_DELAY_MS));
  }, [clearTimers]);

  useEffect(() => {
    clearTimers();
    if (!me) {
      prevRef.current = null;
      setPromo(null);
      return;
    }
    const prev = prevRef.current;
    prevRef.current = me;
    if (!shouldAnimatePromotion(prev, me, reduceMotion)) {
      setDisplayStars(me.stars);
      setPromo(null);
      return;
    }
    setPromo({ start: prev!, target: me });
    runPromo(prev!, me);
    // Only the values, not `runPromo`'s identity, should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.stars, me?.rank, reduceMotion, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const replay = useCallback(() => {
    if (!promo || reduceMotion) return;
    runPromo(promo.start, promo.target);
  }, [promo, reduceMotion, runPromo]);

  const climbed = promo ? ranksClimbed(promo.start.rank, promo.target.rank) : 0;

  return { displayStars, promo, climbed, canReplay: !!promo && !reduceMotion, replay };
}
