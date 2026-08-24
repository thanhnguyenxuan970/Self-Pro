# Habi Android QA evidence

Device: `emulator-5554` (`com.habitring.app`), API 35 emulator.

- `auth-debug-metro-final.png` and `.xml` are the successful data-preserving
  runtime capture from the debug-signed app using Metro. The QA sandbox Home
  screen loaded with no fatal exception, React Native error, redbox, or bundle
  load failure in the paired local audit run.
- `auth-final-final.png` and `.xml` are an earlier successful sanitized runtime
  capture of the same surface.
- `auth-debug-metro-cold-start.*` records the screen before Metro finished
  loading and is diagnostic only, not a UI pass.
- `auth-release-cold-start.*` records a release APK launch attempt that could
  not replace the installed debug-signed package because Android rejected the
  certificate mismatch. Its empty native frame is diagnostic only; it is not
  release-build UI proof.

Raw logcat remains under the ignored `.audit/` boundary and is intentionally
not tracked.
