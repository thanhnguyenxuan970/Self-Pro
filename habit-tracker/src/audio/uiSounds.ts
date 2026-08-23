import * as Haptics from 'expo-haptics';
import { isAudioEnabled } from './audioEnabled';
import type { Tier } from '../config/achievements';

// Static require map — Metro needs literal require() for asset bundling.
const SOUNDS = {
  streakMilestone: require('../assets/sounds/streak-milestone.mp3'),
  modalOpen:       require('../assets/sounds/modal-open.mp3'),
  modalClose:      require('../assets/sounds/modal-close.mp3'),
} as const;
type Cue = keyof typeof SOUNDS;

// Longest cue = 400ms (streak-milestone) + 700ms buffer before cleanup.
const CLEANUP_MS = 1100;

function playOne(cue: Cue): void {
  if (!isAudioEnabled()) return;
  try {
    const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
    const player = createAudioPlayer(SOUNDS[cue]);
    player.play();
    setTimeout(() => { try { player.remove(); } catch { /* ignore */ } }, CLEANUP_MS);
  } catch { /* expo-audio unavailable — non-fatal */ }
}

// Streak milestone (3/7/30-day hit) — Light Impact + sound together.
export function cueStreakMilestone(): void {
  if (isAudioEnabled()) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  playOne('streakMilestone');
}

export function cueBadgeUnlock(tier: Tier): void {
  const isRare = tier !== 'iron' && tier !== 'bronze';
  const isHeavy = tier === 'gold' || tier === 'platinum' || tier === 'diamond';
  if (isAudioEnabled()) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (isHeavy) setTimeout(() => {
      if (isAudioEnabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, 120);
  }
  playOne(isRare ? 'streakMilestone' : 'modalOpen');
}

// Modal open / close — subtle whoosh, no haptic.
export function cueModalOpen(): void  { playOne('modalOpen'); }
export function cueModalClose(): void { playOne('modalClose'); }
