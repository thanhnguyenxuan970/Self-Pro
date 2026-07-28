import * as ImagePicker from 'expo-image-picker';

/** Prompts for library permission then opens the square-crop image picker.
 *  Returns the picked image URI, or null on denied permission / cancel. */
export async function pickSquareImage(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}
