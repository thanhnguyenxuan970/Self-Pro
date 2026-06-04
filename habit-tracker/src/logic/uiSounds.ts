import * as Haptics from 'expo-haptics';
import { isAudioEnabled } from './audioEnabled';

// Static require map — Metro needs literal require() for asset bundling.
const SOUNDS = {
  chipConfirm:     require('../assets/sounds/chip-confirm.mp3'),
  treatClaim:      require('../assets/sounds/treat-claim.mp3'),
  streakMilestone: require('../assets/sounds/streak-milestone.mp3'),
  modalOpen:       require('../assets/sounds/modal-open.mp3'),
  modalClose:      require('../assets/sounds/modal-close.mp3'),
  errorInvalid:    require('../assets/sounds/error-invalid.mp3'),
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

// Chip tap confirm — Light Impact already fired by caller at t=0; sound at t=10ms.
export function cueChipConfirm(): void {
  setTimeout(() => playOne('chipConfirm'), 10);
}

// Treat claim — Medium Impact at t=0, sound at t=50ms per spec.
export function cueTreatClaim(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  setTimeout(() => playOne('treatClaim'), 50);
}

// Streak milestone (3/7/30-day hit) — Light Impact + sound together.
export function cueStreakMilestone(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  playOne('streakMilestone');
}

// Modal open / close — subtle whoosh, no haptic.
export function cueModalOpen(): void  { playOne('modalOpen'); }
export function cueModalClose(): void { playOne('modalClose'); }

// Error / invalid input — Rigid haptic + sound together.
export function cueErrorInvalid(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  playOne('errorInvalid');
}
