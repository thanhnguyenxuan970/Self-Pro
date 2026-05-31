import { Audio } from 'expo-av';

const soundFiles = [
  require('../assets/sounds/level1.mp3'),
  require('../assets/sounds/level2.mp3'),
  require('../assets/sounds/level3.mp3'),
  require('../assets/sounds/level4.mp3'),
] as const;

let audioModeSet = false;

function levelFor(totalMinutes: number): 0 | 1 | 2 | 3 {
  if (totalMinutes >= 90) return 3;
  if (totalMinutes >= 60) return 2;
  if (totalMinutes >= 30) return 1;
  return 0;
}

export async function playCelebration(totalMinutes: number): Promise<void> {
  try {
    if (!audioModeSet) {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      audioModeSet = true;
    }
    const { sound } = await Audio.Sound.createAsync(soundFiles[levelFor(totalMinutes)]);
    sound.setOnPlaybackStatusUpdate(status => {
      if ('didJustFinish' in status && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
    await sound.playAsync();
  } catch {
    // silent fail — SFX is non-critical
  }
}
