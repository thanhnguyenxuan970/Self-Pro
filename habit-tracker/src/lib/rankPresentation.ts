import { getRankConfigByTierOrder } from '../config/ranks.config';

export function shouldRunRankLoop(opts: { reduceMotion: boolean; loop: boolean; hasLoopAnimation: boolean }) {
  return !opts.reduceMotion && opts.loop && opts.hasLoopAnimation;
}

export function shouldRunCelebrationBurst(visible: boolean, reduceMotion: boolean) {
  return visible && !reduceMotion;
}

export function getCelebrationGlowColor(tierOrder: number) {
  const cfg = getRankConfigByTierOrder(tierOrder);
  return cfg.glow ?? cfg.color;
}
