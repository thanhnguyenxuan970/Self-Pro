---
name: emulator
description: Reusable Android emulator workflow for habit-tracker — adb reverse, cache reset, and computing correct tap coordinates from a screenshot. Use before any adb-driven UI interaction (tap/swipe) or when a fix needs verification via `adb shell input tap`.
---

# emulator

Standard setup + coordinate math for driving the habit-tracker Android emulator via adb. Prevents two recurring mistakes: forgetting `adb reverse` before Metro connects, and tapping wrong coordinates because the screenshot pixel size wasn't reconciled with the device's actual resolution.

## Setup (run once per session / after emulator restart)

```
adb reverse tcp:8081 tcp:8081
```

Required for the app to reach the Metro dev server. Without it: "Unable to load script" errors on launch.

## Cache reset (Metro stale module graph)

```
rmdir /s /q "%TEMP%\metro-cache" 2>nul
rmdir /s /q "%TEMP%\metro-file-map-expo-*" 2>nul
```

Or `expo start --clear`. Use when Metro serves stale/missing modules after a file move or restructure (see `metro-fix` skill for the full diagnostic loop).

## Computing correct tap coordinates

`adb shell input tap X Y` uses **raw device pixel coordinates** — the same pixel space as a full-resolution `adb exec-out screencap -p` capture. The recurring bug: reading tap coordinates off a screenshot as *displayed* (e.g. resized in a viewer or scaled down for review) instead of off the screenshot's *actual* pixel dimensions, producing taps that land on the wrong element.

1. **Get the device's real resolution** (don't assume — some AVDs use an override size):
   ```
   adb shell wm size
   ```
   Output shows `Physical size: WxH` and, if set, `Override size: WxH` — use the override value if present; that's what `screencap` and `input tap` both operate in.

2. **Capture the screenshot**:
   ```
   adb exec-out screencap -p > screenshot.png
   ```
   This file is captured at the resolution from step 1 — full device pixels, no DPI scaling applied.

3. **Read the screenshot's actual pixel dimensions** before computing any tap point — do not eyeball coordinates from how the image renders in a chat/viewer pane, since viewers commonly downscale for display. If you picked a point by eye on a *displayed* image, first get that image's true pixel size and scale:
   ```
   scale_x = actual_png_width  / displayed_width
   scale_y = actual_png_height / displayed_height
   tap_x = round(displayed_x * scale_x)
   tap_y = round(displayed_y * scale_y)
   ```
   If you're reading the raw PNG directly (not a resized preview), `scale_x = scale_y = 1` — displayed coordinates already equal tap coordinates.

4. **Tap**:
   ```
   adb shell input tap <tap_x> <tap_y>
   ```

## Verify

After any tap-driven interaction, re-screenshot and confirm the expected screen/state changed before proceeding — don't chain blind taps.
