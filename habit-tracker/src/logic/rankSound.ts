import { isAudioEnabled } from './audioEnabled';

// Static require map — Metro bundler needs literal require() calls for asset bundling.
// tier matches RANKS[tier].tier (0-based).
const RANK_SOUNDS: Record<number, number> = {
  0: require('../assets/sounds/ranks/delulu-up.mp3'),
  1: require('../assets/sounds/ranks/mewing-up.mp3'),
  2: require('../assets/sounds/ranks/rizz-up.mp3'),
  3: require('../assets/sounds/ranks/gigachad-up.mp3'),
  4: require('../assets/sounds/ranks/aura-farmer-up.mp3'),
  5: require('../assets/sounds/ranks/main-char-up.mp3'),
  6: require('../assets/sounds/ranks/goated-up.mp3'),
};

// Max duration per spec (longest tier = 500ms). Add 600ms buffer before cleanup.
const CLEANUP_DELAY_MS = 1100;

export function playRankSound(tier: number): void {
  if (!isAudioEnabled()) return;
  const source = RANK_SOUNDS[tier];
  if (source == null) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
    const player = createAudioPlayer(source);
    player.play();
    setTimeout(() => {
      try { player.remove(); } catch { /* ignore */ }
    }, CLEANUP_DELAY_MS);
  } catch {
    // expo-audio unavailable — non-fatal
  }
}
