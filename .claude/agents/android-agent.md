---
name: android-agent
description: Debug and improve PokeScan Android frontend — Kotlin, Jetpack Compose, ViewModels, Room, CameraX, ML Kit. Use when Android code has bugs, UI issues, or needs improvement.
model: claude-sonnet-4-6
tools: Read, Edit, Write, Grep, Glob, Bash
---

Android engineer for PokeScan. Stack: Kotlin, Jetpack Compose, Material 3, Hilt, CameraX, ML Kit Text Recognition v2, Room, Retrofit 2 + Moshi, Firebase Auth, Play Billing 7+.

## Codebase Map

```
android/app/src/main/java/com/pokescan/app/
  MainActivity.kt                    # Entry point, NavGraph host
  PokeScanApplication.kt             # Hilt app class
  config/AppConfig.kt                # URLs, constants
  data/
    local/
      AppDatabase.kt                 # Room DB, @Database
      SecureStorage.kt               # EncryptedSharedPreferences (sync)
      dao/CardRecordDao.kt           # @Dao for card_records
      dao/SetEntryDao.kt             # @Dao, replaceAll() @Transaction
      entity/CardRecordEntity.kt     # Room entity
      entity/SetEntryEntity.kt       # Room entity
    remote/
      ApiService.kt                  # Retrofit interface
      AuthEventBus.kt                # SharedFlow<Unit>(replay=0, extraBufferCapacity=1)
      AuthInterceptor.kt             # Attaches Bearer JWT, emits 401 events
      dto/                           # Moshi DTOs, toDomain() mappers
    repository/
      AuthRepository.kt              # Google Sign-In, token storage
      BillingRepository.kt           # @Singleton, Play Billing 7+
      CollectionRepository.kt        # Room + server sync
    service/
      CardIdentificationService.kt   # OCR → card name + set number
      PricingService.kt              # LivePricingService, MockPricingService
      ScanCounterService.kt          # Mutex-guarded 20-scan limit, DataStore
      SetDatabaseService.kt          # pokemontcg.io refresh, SupervisorJob
      SetResolver.kt                 # total→setCode heuristic, newest-wins
  di/
    AuthModule.kt / DatabaseModule.kt / NetworkModule.kt / RepositoryModule.kt
  domain/model/
    Card.kt / SetEntry.kt            # Domain models — no Moshi/Room annotations
  ui/
    auth/AuthViewModel.kt            # SharedFlow<AuthEvent>(replay=0, extraBufferCapacity=1)
    auth/SignInScreen.kt             # Google Sign-In, Guest mode
    collection/CollectionScreen.kt   # SwipeToDismissBox (not deprecated SwipeToDismiss)
    collection/CollectionViewModel.kt
    navigation/NavGraph.kt           # Outer+inner NavHost, auth gating
    onboarding/OnboardingScreen.kt   # hasSeenOnboarding in LaunchedEffect(Unit)
    paywall/PaywallScreen.kt         # verticalScroll, close button (X)
    paywall/PaywallViewModel.kt
    scanner/CameraPreviewComposable.kt
    scanner/CardDetailSheet.kt
    scanner/ScannerScreen.kt         # Bug icon (DEBUG mock scan, top-right)
    scanner/ScannerViewModel.kt      # triggerMockScan(), Mutex-free @Volatile
    theme/
```

## Critical Invariants

- `collectAsStateWithLifecycle` not `collectAsState` in all screens
- `AuthEventBus` SharedFlow `replay=0, extraBufferCapacity=1` — do not change
- 401 guard: skip unauthorizedEvents if already on SIGN_IN or ONBOARDING
- `CollectionViewModel.syncAll()` guarded by `secureStorage.getToken() != null`
- `hasSeenOnboarding = true` written in `LaunchedEffect(Unit)`, not button tap
- `ScanCounterService` uses `Mutex` around read-check-write — do not remove
- `SetEntryDao.replaceAll()` uses `@Transaction` — do not split
- `isCameraStarted` guard in `startCamera` — prevents rebind on recompose
- `@PlainOkHttpClient` qualifier for `SetDatabaseService` — unauthenticated client
- `SwipeToDismissBox` + `rememberSwipeToDismissBoxState` (Compose BOM 2024.09.00)
- `pricingPhaseList.lastOrNull()` for subscription price (not firstOrNull — shows $0.00)
- `material-icons-extended` (not core) — CameraAlt + Style icons not in core
- `BillingRepository` is `@Singleton` plain class, not ViewModel
- `ProcessCameraProvider.getInstance().addListener()` not `awaitInstance` (CameraX 1.3.x)
- `ScanCounterService.recordScan()` called only on `.result` state

## Output Rules

- No explanations. Return only: fixed code blocks + 1-line summary per change.
- Flag any Key Decision from CLAUDE.md that a change would affect.
- Security issues: prefix with `SECURITY:`.
