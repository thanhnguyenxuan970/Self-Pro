// uiSounds.ts
// P2 (Polish) + P3 (Post-MVP) sound + haptic cues.
// Each cue's haptic pairing matches the spec table exactly.
// Deps: expo-av, expo-haptics.

import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

let soundOn = true, hapticOn = true;
export const setUiSoundOn = (v: boolean) => { soundOn = v; };
export const setUiHapticOn = (v: boolean) => { hapticOn = v; };

// ── one-shot cues ───────────────────────────────────────────
const ONE_SHOT = {
  treatClaim:      require('../../assets/sfx/ui/treat-claim.mp3'),
  streakMilestone: require('../../assets/sfx/ui/streak-milestone.mp3'),
  modalOpen:       require('../../assets/sfx/ui/modal-open.mp3'),
  modalClose:      require('../../assets/sfx/ui/modal-close.mp3'),
  errorInvalid:    require('../../assets/sfx/ui/error-invalid.mp3'),
} as const;
type Cue = keyof typeof ONE_SHOT;

const cache = new Map<Cue, Audio.Sound>();
export async function preloadUiSounds() {
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  await Promise.all((Object.keys(ONE_SHOT) as Cue[]).map(async k => {
    try { const { sound } = await Audio.Sound.createAsync(ONE_SHOT[k], { volume: 0.85 }); cache.set(k, sound); } catch {}
  }));
}
async function play(cue: Cue) {
  if (!soundOn) return;
  try {
    let s = cache.get(cue);
    if (!s) { const r = await Audio.Sound.createAsync(ONE_SHOT[cue]); s = r.sound; cache.set(cue, s); }
    await s.replayAsync();
  } catch {}
}
const H = (fn: () => void) => { if (hapticOn) fn(); };

// ── PUBLIC CUES (haptic timing per spec) ────────────────────

// Treat claim — Medium impact at t=0, sound at t=50ms (haptic leads)
export function cueTreatClaim() {
  H(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}));
  setTimeout(() => play('treatClaim'), 50);
}

// Streak milestone (3/7/30-day) — Light impact, sound together
export function cueStreakMilestone() {
  H(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}));
  play('streakMilestone');
}

// Modal open / close — subtle whoosh, no haptic
export function cueModalOpen()  { play('modalOpen'); }
export function cueModalClose() { play('modalClose'); }

// Error / invalid input — descending buzz + Rigid haptic, fired together
export function cueErrorInvalid() {
  H(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {}));
  play('errorInvalid');
}

// ── P3: per-tier ambient idle loop (tied to mascot anim cycle) ──
const IDLE: Record<string, any> = {
  'delulu':         require('../../assets/sfx/ui/rank-idle-delulu.mp3'),
  'mewing':         require('../../assets/sfx/ui/rank-idle-mewing.mp3'),
  'rizz':           require('../../assets/sfx/ui/rank-idle-rizz.mp3'),
  'gigachad':       require('../../assets/sfx/ui/rank-idle-gigachad.mp3'),
  'aura-farmer':    require('../../assets/sfx/ui/rank-idle-aura-farmer.mp3'),
  'main-character': require('../../assets/sfx/ui/rank-idle-main-character.mp3'),
  'goated':         require('../../assets/sfx/ui/rank-idle-goated.mp3'),
};
let idleSound: Audio.Sound | null = null;
export async function startIdleLoop(rankSlug: string) {
  if (!soundOn || !IDLE[rankSlug]) return;
  await stopIdleLoop();
  try {
    const { sound } = await Audio.Sound.createAsync(IDLE[rankSlug], { isLooping: true, volume: 0.25 });
    idleSound = sound; await sound.playAsync();
  } catch {}
}
export async function stopIdleLoop() {
  if (idleSound) { try { await idleSound.stopAsync(); await idleSound.unloadAsync(); } catch {} idleSound = null; }
}

export async function unloadUiSounds() {
  for (const s of cache.values()) { try { await s.unloadAsync(); } catch {} }
  cache.clear(); await stopIdleLoop();
}

/* ── USAGE ───────────────────────────────────────────────────
 onEnjoy success     → cueTreatClaim()
 showStreakToast()   → cueStreakMilestone()        // on 3/7/30-day hit
 sheet visible=true  → cueModalOpen()
 sheet visible=false → cueModalClose()
 invalid duration    → cueErrorInvalid()
 RankMascot mount    → startIdleLoop('rizz') ; on unmount → stopIdleLoop()
──────────────────────────────────────────────────────────── */
