type BackNavigation = { canGoBack: () => boolean; goBack: () => void };

export function handleAppHardwareBack(navigation: BackNavigation): boolean {
  if (!navigation.canGoBack()) return false;
  navigation.goBack();
  return true;
}
