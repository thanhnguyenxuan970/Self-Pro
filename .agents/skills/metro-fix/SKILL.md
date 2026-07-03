---
name: metro-fix
description: Diagnose and fix Metro bundler / "Unable to load script" errors on the habit-tracker Android emulator — adb reverse, cache clear, restart, verify.
---

# metro-fix

Run in order, don't skip steps:

1. `adb reverse tcp:8081 tcp:8081`
2. Clear Metro cache: `npx react-native start --reset-cache` (or delete `%TEMP%\metro-cache` + `%TEMP%\metro-file-map-expo-*` if using Expo)
3. Restart the app on the emulator
4. Screenshot to verify UI loads with 0 errors before reporting done — don't claim fixed on assumption.
