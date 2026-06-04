# Directory Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `src/` from a flat layer-by-layer layout into a semantically grouped, scalable structure that makes every file's purpose obvious from its location alone.

**Architecture:** Split the bloated `logic/` directory (18 files, 4 concerns) into `audio/`, `game/`, and `utils/` layers. Consolidate external I/O into `api/`. Move root-level config files (`constants.ts`, `theme.ts`, `i18n.ts`) into the existing `config/` directory. Remove one dead no-op stub. Optionally add tsconfig path aliases.

**Tech Stack:** React Native + Expo SDK 56, TypeScript, TanStack Query v5, PowerShell (Windows), Bash via Claude Code

---

## Target Structure

```
src/
  api/         ← supabase.ts, syncService.ts          (was: lib/ + services/)
  assets/      ← sounds/, sounds/ranks/               (unchanged)
  audio/       ← audioEnabled.ts, uiSounds.ts,        (was: logic/)
                  rankSound.ts
  components/  ← DurationChips.tsx, RankMascot.tsx    (unchanged)
  config/      ← ranks.config.ts, constants.ts,       (was: config/ + src root)
                  theme.ts, i18n.ts
  contexts/    ← SettingsContext.tsx                  (unchanged)
  db/          ← client.ts, migrations.ts, schema.ts  (unchanged)
  game/        ← points.ts, chipPresets.ts,           (was: logic/)
                  treatLogic.ts, tierUnlocks.ts,
                  rankUtils.ts, streakFreeze.ts,
                  weeklyReset.ts, seedTemplates.ts,
                  logTask.ts
  hooks/       ← useAuth.ts, useSettings.ts           (unchanged)
  lib/         ← rankMascotBridge.ts                  (unchanged)
  navigation/  ← RootNavigator.tsx                    (unchanged)
  queries/     ← all TanStack Query hooks             (unchanged)
  screens/     ← all screens                          (unchanged)
  utils/       ← formatters.ts, notifications.ts,    (was: logic/)
                  settingsLogic.ts, weekReset.ts
```

**Directories removed:** `src/logic/` (fully emptied), `src/services/` (fully emptied), `src/lib/` (supabase.ts moved out; only rankMascotBridge.ts remains so lib/ stays).

---

## Task 1: Delete `celebrateSound.ts` dead code

**Files:**
- Delete: `src/logic/celebrateSound.ts`
- Modify: `src/screens/LogActivitySheet.tsx`

`celebrateSound.ts` is a no-op stub (expo-av removed on Day 19). It exports `playCelebration()` which does nothing. `LogActivitySheet.tsx` is its only caller.

- [ ] **Step 1: Find and remove the import in LogActivitySheet.tsx**

Open `src/screens/LogActivitySheet.tsx`. Find the line:
```ts
import { playCelebration } from '../logic/celebrateSound';
```
Delete that line. Also find any call to `playCelebration(...)` and delete it.

Use Grep first to confirm exact line:
```bash
grep -n "celebrateSound\|playCelebration" src/screens/LogActivitySheet.tsx
```

Then use Edit to remove the import line and any call sites.

- [ ] **Step 2: Delete the file**

```bash
rm src/logic/celebrateSound.ts
```

- [ ] **Step 3: Verify no remaining references**

```bash
grep -r "celebrateSound\|playCelebration" src/ --include="*.ts" --include="*.tsx"
```
Expected: no output.

- [ ] **Step 4: TypeScript check**

```bash
cd habit-tracker && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove celebrateSound no-op stub (expo-av was removed Day 19)"
```

---

## Task 2: Create `audio/` layer

**Files:**
- Create dir: `src/audio/`
- Move: `src/logic/audioEnabled.ts` → `src/audio/audioEnabled.ts`
- Move: `src/logic/uiSounds.ts` → `src/audio/uiSounds.ts`
- Move: `src/logic/rankSound.ts` → `src/audio/rankSound.ts`
- Modify (imports): `src/audio/uiSounds.ts`, `src/components/RankMascot.tsx`, `src/screens/DurationChips.tsx` (actually `src/components/DurationChips.tsx`), `src/screens/FundScreen.tsx`, `src/screens/TodayScreen.tsx`, `src/screens/LogActivitySheet.tsx`

- [ ] **Step 1: Create directory and move files**

```bash
mkdir src/audio
mv src/logic/audioEnabled.ts src/audio/audioEnabled.ts
mv src/logic/uiSounds.ts src/audio/uiSounds.ts
mv src/logic/rankSound.ts src/audio/rankSound.ts
```

- [ ] **Step 2: Find all import sites**

```bash
grep -rn "logic/audioEnabled\|logic/uiSounds\|logic/rankSound" src/ --include="*.ts" --include="*.tsx"
```

Note every file path and line number returned. These are the files that need import updates.

- [ ] **Step 3: Update imports in `src/audio/uiSounds.ts`**

`uiSounds.ts` imports audioEnabled from the same old logic/ path. After the move both files are in `src/audio/` so the new import is `./audioEnabled`.

Find the line (it will look like):
```ts
import { isAudioEnabled } from '../logic/audioEnabled';
```
Change to:
```ts
import { isAudioEnabled } from './audioEnabled';
```

- [ ] **Step 4: Update imports in `src/components/RankMascot.tsx`**

Find lines like:
```ts
import { playRankSound } from '../logic/rankSound';
```
Change to:
```ts
import { playRankSound } from '../audio/rankSound';
```

If there is also an import of `audioEnabled`:
```ts
import { isAudioEnabled } from '../logic/audioEnabled';
```
Change to:
```ts
import { isAudioEnabled } from '../audio/audioEnabled';
```

- [ ] **Step 5: Update imports in `src/components/DurationChips.tsx`**

Find:
```ts
import { cueChipConfirm } from '../logic/uiSounds';
```
Change to:
```ts
import { cueChipConfirm } from '../audio/uiSounds';
```

(Or whatever specific symbols are imported — the path change is `logic/` → `audio/`.)

- [ ] **Step 6: Update imports in `src/screens/FundScreen.tsx`**

Find:
```ts
import { ... } from '../logic/uiSounds';
```
Change to:
```ts
import { ... } from '../audio/uiSounds';
```

- [ ] **Step 7: Update imports in `src/screens/TodayScreen.tsx`**

Find:
```ts
import { ... } from '../logic/uiSounds';
```
Change to:
```ts
import { ... } from '../audio/uiSounds';
```

- [ ] **Step 8: Update imports in `src/screens/LogActivitySheet.tsx`**

Find:
```ts
import { ... } from '../logic/uiSounds';
```
Change to:
```ts
import { ... } from '../audio/uiSounds';
```

- [ ] **Step 9: Verify no stale logic/audio imports remain**

```bash
grep -rn "logic/audioEnabled\|logic/uiSounds\|logic/rankSound" src/ --include="*.ts" --include="*.tsx"
```
Expected: no output.

- [ ] **Step 10: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: extract audio/ layer from logic/ (audioEnabled, uiSounds, rankSound)"
```

---

## Task 3: Create `game/` layer

**Files:**
- Create dir: `src/game/`
- Move: `src/logic/points.ts` → `src/game/points.ts`
- Move: `src/logic/chipPresets.ts` → `src/game/chipPresets.ts`
- Move: `src/logic/treatLogic.ts` → `src/game/treatLogic.ts`
- Move: `src/logic/tierUnlocks.ts` → `src/game/tierUnlocks.ts`
- Move: `src/logic/rankUtils.ts` → `src/game/rankUtils.ts`
- Move: `src/logic/streakFreeze.ts` → `src/game/streakFreeze.ts`
- Move: `src/logic/weeklyReset.ts` → `src/game/weeklyReset.ts`
- Move: `src/logic/seedTemplates.ts` → `src/game/seedTemplates.ts`
- Move: `src/logic/logTask.ts` → `src/game/logTask.ts`
- Modify: all importer files (found via grep below)

- [ ] **Step 1: Create directory and move files**

```bash
mkdir src/game
mv src/logic/points.ts src/game/points.ts
mv src/logic/chipPresets.ts src/game/chipPresets.ts
mv src/logic/treatLogic.ts src/game/treatLogic.ts
mv src/logic/tierUnlocks.ts src/game/tierUnlocks.ts
mv src/logic/rankUtils.ts src/game/rankUtils.ts
mv src/logic/streakFreeze.ts src/game/streakFreeze.ts
mv src/logic/weeklyReset.ts src/game/weeklyReset.ts
mv src/logic/seedTemplates.ts src/game/seedTemplates.ts
mv src/logic/logTask.ts src/game/logTask.ts
```

- [ ] **Step 2: Find all import sites in src/**

```bash
grep -rn "logic/points\|logic/chipPresets\|logic/treatLogic\|logic/tierUnlocks\|logic/rankUtils\|logic/streakFreeze\|logic/weeklyReset\|logic/seedTemplates\|logic/logTask" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 3: Find all import sites in __tests__/**

```bash
grep -rn "logic/points\|logic/chipPresets\|logic/treatLogic\|logic/tierUnlocks\|logic/rankUtils\|logic/streakFreeze\|logic/weeklyReset\|logic/seedTemplates\|logic/logTask" __tests__/ --include="*.ts"
```

Test files use paths like `'../src/logic/rankUtils'` → `'../src/game/rankUtils'`.

- [ ] **Step 4: Update imports — known src/ importer files**

For each file found in Step 2, change all occurrences of `logic/<name>` → `game/<name>` in the import path. The relative prefix (`../` or `../../`) stays the same; only the directory segment changes.

Key files expected to need updates:
- `src/queries/useToday.ts` — imports `logTask`, `points`, `tierUnlocks`
- `src/queries/useTreats.ts` — imports `treatLogic`
- `src/queries/useFund.ts` — imports `streakFreeze`
- `src/queries/useRank.ts` — imports `rankUtils`, `weeklyReset`
- `src/queries/useTasks.ts` — imports `seedTemplates`
- `src/queries/useDurationLogger.ts` — imports `chipPresets`, `points`
- `src/screens/FundScreen.tsx` — imports `treatLogic`, `streakFreeze`
- `src/screens/OnboardingScreen.tsx` — imports `seedTemplates`
- `src/screens/RankScreen.tsx` — imports `rankUtils`
- `src/contexts/SettingsContext.tsx` — possibly imports `weeklyReset`
- `src/db/migrations.ts` — imports `seedTemplates`

For each file, use Edit to change e.g.:
```ts
import { computeStars } from '../logic/points';
```
to:
```ts
import { computeStars } from '../game/points';
```

- [ ] **Step 5: Update imports in test files**

For each test file found in Step 3, change `'../src/logic/<name>'` → `'../src/game/<name>'`.

Example in `__tests__/rankUtils.test.ts`:
```ts
import { ... } from '../src/logic/rankUtils';
```
→
```ts
import { ... } from '../src/game/rankUtils';
```

Same pattern for: `logTask.test.ts`, `tierUnlocks.test.ts`, `treatLogic.test.ts`, `streakFreeze.test.ts`, `weeklyReset.test.ts`, `seedTemplates.test.ts`.

- [ ] **Step 6: Verify no stale logic/game imports remain**

```bash
grep -rn "logic/points\|logic/chipPresets\|logic/treatLogic\|logic/tierUnlocks\|logic/rankUtils\|logic/streakFreeze\|logic/weeklyReset\|logic/seedTemplates\|logic/logTask" src/ __tests__/ --include="*.ts" --include="*.tsx"
```
Expected: no output.

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 8: Run tests**

```bash
npx jest --runInBand
```
Expected: 98/98 pass (all green).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: extract game/ layer from logic/ (9 files: logTask, points, chipPresets, etc.)"
```

---

## Task 4: Create `utils/` layer

**Files:**
- Create dir: `src/utils/`
- Move: `src/logic/formatters.ts` → `src/utils/formatters.ts`
- Move: `src/logic/notifications.ts` → `src/utils/notifications.ts`
- Move: `src/logic/settingsLogic.ts` → `src/utils/settingsLogic.ts`
- Move: `src/logic/weekReset.ts` → `src/utils/weekReset.ts`
- Modify: all importer files + App.tsx + __tests__/

- [ ] **Step 1: Create directory and move files**

```bash
mkdir src/utils
mv src/logic/formatters.ts src/utils/formatters.ts
mv src/logic/notifications.ts src/utils/notifications.ts
mv src/logic/settingsLogic.ts src/utils/settingsLogic.ts
mv src/logic/weekReset.ts src/utils/weekReset.ts
```

- [ ] **Step 2: Find all import sites in src/**

```bash
grep -rn "logic/formatters\|logic/notifications\|logic/settingsLogic\|logic/weekReset" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 3: Find import sites in root files and __tests__/**

```bash
grep -rn "logic/formatters\|logic/notifications\|logic/settingsLogic\|logic/weekReset" __tests__/ App.tsx --include="*.ts" --include="*.tsx" 2>/dev/null
```

`App.tsx` imports `weekReset` (from `./src/logic/weekReset`). Change to `./src/utils/weekReset`.

- [ ] **Step 4: Update imports — src/ files**

Key files expected:
- `src/contexts/SettingsContext.tsx` — imports `settingsLogic`
- `src/screens/ProgressScreen.tsx` — imports `formatters`
- `src/screens/ProfileScreen.tsx` — imports `formatters`
- `src/screens/TodayScreen.tsx` — imports `formatters`
- `src/queries/useProgress.ts` — imports `formatters`
- `src/queries/useSettings.ts` — imports `notifications`

For each file, change `logic/formatters` → `utils/formatters`, `logic/notifications` → `utils/notifications`, etc.

Example Edit in `src/contexts/SettingsContext.tsx`:
```ts
import { parseSettingsBool, parseSettingsLang, validateNotificationTime } from '../logic/settingsLogic';
```
→
```ts
import { parseSettingsBool, parseSettingsLang, validateNotificationTime } from '../utils/settingsLogic';
```

- [ ] **Step 5: Update import in `App.tsx`**

Find:
```ts
import { shouldShowWeekResetToast } from './src/logic/weekReset';
```
Change to:
```ts
import { shouldShowWeekResetToast } from './src/utils/weekReset';
```

- [ ] **Step 6: Update test file imports**

In `__tests__/weekResetToast.test.ts`:
```ts
import { shouldShowWeekResetToast } from '../src/logic/weekReset';
```
→
```ts
import { shouldShowWeekResetToast } from '../src/utils/weekReset';
```

In `__tests__/settings.test.ts`:
```ts
import { parseSettingsBool, parseSettingsLang, validateNotificationTime } from '../src/logic/settingsLogic';
```
→
```ts
import { parseSettingsBool, parseSettingsLang, validateNotificationTime } from '../src/utils/settingsLogic';
```

In `__tests__/notifications.test.ts`:
```ts
import { ... } from '../src/logic/notifications';
```
→
```ts
import { ... } from '../src/utils/notifications';
```

- [ ] **Step 7: Verify logic/ is now empty**

```bash
ls src/logic/
```
Expected: empty directory (no files). If empty, remove it:
```bash
rmdir src/logic
```

- [ ] **Step 8: Verify no stale logic/ imports remain anywhere**

```bash
grep -rn "from.*logic/" src/ __tests__/ App.tsx --include="*.ts" --include="*.tsx" 2>/dev/null
```
Expected: no output.

- [ ] **Step 9: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 10: Run tests**

```bash
npx jest --runInBand
```
Expected: 98/98 pass.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: extract utils/ layer from logic/; delete empty logic/ dir"
```

---

## Task 5: Create `api/` layer

**Files:**
- Create dir: `src/api/`
- Move: `src/lib/supabase.ts` → `src/api/supabase.ts`
- Move: `src/services/syncService.ts` → `src/api/syncService.ts`
- Modify: `src/api/syncService.ts` (internal import), `src/queries/useToday.ts`, `src/hooks/useAuth.ts`, any other importers

- [ ] **Step 1: Create directory and move files**

```bash
mkdir src/api
mv src/lib/supabase.ts src/api/supabase.ts
mv src/services/syncService.ts src/api/syncService.ts
```

- [ ] **Step 2: Fix internal import inside syncService.ts**

`syncService.ts` imports from `'../lib/supabase'`. After moving both files into `src/api/`, the import should be `'./supabase'`.

In `src/api/syncService.ts`, find:
```ts
import { supabase } from '../lib/supabase';
```
Change to:
```ts
import { supabase } from './supabase';
```

- [ ] **Step 3: Find all import sites for supabase and syncService**

```bash
grep -rn "lib/supabase\|services/syncService\|services/sync" src/ __tests__/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 4: Update imports in `src/queries/useToday.ts`**

Find:
```ts
import { syncUserStreak } from '../services/syncService';
```
Change to:
```ts
import { syncUserStreak } from '../api/syncService';
```

- [ ] **Step 5: Update imports in `src/hooks/useAuth.ts`**

If `useAuth.ts` imports from `lib/supabase`:
```ts
import { supabase } from '../lib/supabase';
```
Change to:
```ts
import { supabase } from '../api/supabase';
```

Also check any other files that surfaced in Step 3 and update them the same way.

- [ ] **Step 6: Remove empty directories**

```bash
rmdir src/services
```

`src/lib/` still contains `rankMascotBridge.ts`, so do NOT remove it.

- [ ] **Step 7: Verify no stale lib/supabase or services/ imports**

```bash
grep -rn "lib/supabase\|services/sync" src/ __tests__/ --include="*.ts" --include="*.tsx"
```
Expected: no output.

- [ ] **Step 8: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: create api/ layer (supabase client + syncService); remove empty services/ dir"
```

---

## Task 6: Consolidate `config/` directory

**Files:**
- Move: `src/constants.ts` → `src/config/constants.ts`
- Move: `src/theme.ts` → `src/config/theme.ts`
- Move: `src/i18n.ts` → `src/config/i18n.ts`
- Modify: all importer files (theme has 12+ importers)

- [ ] **Step 1: Move files**

```bash
mv src/constants.ts src/config/constants.ts
mv src/theme.ts src/config/theme.ts
mv src/i18n.ts src/config/i18n.ts
```

- [ ] **Step 2: Find all theme importers**

```bash
grep -rn "from.*['\"].*theme['\"]" src/ --include="*.ts" --include="*.tsx"
```

Expected importers (12 files):
- `src/components/DurationChips.tsx`
- `src/hooks/useSettings.ts`
- `src/navigation/RootNavigator.tsx`
- `src/screens/FundScreen.tsx`
- `src/screens/LogActivitySheet.tsx`
- `src/screens/OnboardingScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/screens/ProgressScreen.tsx`
- `src/screens/RankScreen.tsx`
- `src/screens/SettingsScreen.tsx`
- `src/screens/SignInScreen.tsx`
- `src/screens/TodayScreen.tsx`

For each, the import `from '../theme'` (from screens/ or hooks/) → `from '../config/theme'`.
For `src/navigation/RootNavigator.tsx`: `from '../theme'` → `from '../config/theme'`.
For `src/components/DurationChips.tsx`: `from '../theme'` → `from '../config/theme'`.

- [ ] **Step 3: Update theme import in every screen**

For all 12 files, use Edit. Pattern: change `from '../theme'` → `from '../config/theme'`.

(The path depth doesn't change — screens are in `src/screens/`, theme is now in `src/config/`, both one level down from `src/`, so relative path is `'../config/theme'` from screens/.)

- [ ] **Step 4: Find all constants importers**

```bash
grep -rn "from.*['\"].*constants['\"]" src/ --include="*.ts" --include="*.tsx"
```

Expected importers:
- `src/game/logTask.ts` — `from '../constants'` → `from '../config/constants'`

Wait: after Task 3 moved logTask to src/game/, it was at `src/logic/logTask.ts` with `from '../constants'`. Now at `src/game/logTask.ts`, the import `from '../constants'` would have been `../../constants` from original path... Actually `src/logic/logTask.ts` imports `'../constants'` which resolves to `src/constants.ts`. After move to `src/game/logTask.ts`, `'../constants'` still resolves to `src/constants.ts` (unchanged). So the import path `'../constants'` needs to become `'../config/constants'`.

For each importer file, change `from '../constants'` → `from '../config/constants'` (or whatever relative path is correct given file depth).

- [ ] **Step 5: Update constants imports in game/ and queries/**

For `src/game/logTask.ts`:
```ts
import { ... } from '../constants';
```
→
```ts
import { ... } from '../config/constants';
```

Same update for any other files importing constants (check Step 4 output for the full list).

- [ ] **Step 6: Find all i18n importers**

```bash
grep -rn "from.*['\"].*i18n['\"]" src/ __tests__/ --include="*.ts" --include="*.tsx"
```

Expected importers:
- `src/hooks/useSettings.ts` — `from '../i18n'` → `from '../config/i18n'`
- `src/screens/FundScreen.tsx` — may import i18n directly
- Any other file surfaced by grep

- [ ] **Step 7: Update i18n imports**

For each file found, change `from '../i18n'` → `from '../config/i18n'` (adjusting depth as needed).

- [ ] **Step 8: Verify no stale root-level imports**

```bash
grep -rn "from '\.\.\/theme'\|from '\.\.\/constants'\|from '\.\.\/i18n'" src/ --include="*.ts" --include="*.tsx"
grep -rn "from '\.\/theme'\|from '\.\/constants'\|from '\.\/i18n'" src/ --include="*.ts" --include="*.tsx"
```
Expected: no output.

- [ ] **Step 9: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 10: Run tests**

```bash
npx jest --runInBand
```
Expected: 98/98 pass.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: consolidate constants/theme/i18n into config/ directory"
```

---

## Task 7: Add TypeScript path aliases (optional quality-of-life)

**Files:**
- Modify: `tsconfig.json`
- Modify: `babel.config.js`

Path aliases let any file use `@audio/uiSounds` instead of `../../../audio/uiSounds`. Requires both TypeScript (type checking) and Babel (Metro bundler at runtime) to know the mapping.

- [ ] **Step 1: Install babel-plugin-module-resolver**

```bash
npm install --save-dev babel-plugin-module-resolver
```

- [ ] **Step 2: Update `tsconfig.json`**

Current content:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"]
  }
}
```

Replace with:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"],
    "baseUrl": ".",
    "paths": {
      "@api/*": ["src/api/*"],
      "@audio/*": ["src/audio/*"],
      "@components/*": ["src/components/*"],
      "@config/*": ["src/config/*"],
      "@contexts/*": ["src/contexts/*"],
      "@db/*": ["src/db/*"],
      "@game/*": ["src/game/*"],
      "@hooks/*": ["src/hooks/*"],
      "@lib/*": ["src/lib/*"],
      "@navigation/*": ["src/navigation/*"],
      "@queries/*": ["src/queries/*"],
      "@screens/*": ["src/screens/*"],
      "@utils/*": ["src/utils/*"]
    }
  }
}
```

- [ ] **Step 3: Update `babel.config.js`**

Current `babel.config.js` content (read it first, then add the plugin). Add `module-resolver` plugin:

```js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@api': './src/api',
            '@audio': './src/audio',
            '@components': './src/components',
            '@config': './src/config',
            '@contexts': './src/contexts',
            '@db': './src/db',
            '@game': './src/game',
            '@hooks': './src/hooks',
            '@lib': './src/lib',
            '@navigation': './src/navigation',
            '@queries': './src/queries',
            '@screens': './src/screens',
            '@utils': './src/utils',
          },
        },
      ],
    ],
  };
};
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Run tests**

```bash
npx jest --runInBand
```
Expected: 98/98 pass.

> **Note:** Path aliases are available now but existing imports are NOT automatically converted. New code written after this point can use `@game/points` etc. Convert existing imports incrementally as files are touched in future sessions.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add tsconfig path aliases + babel module-resolver for @api, @audio, @game, @utils etc."
```

---

## Task 8: Final verification

- [ ] **Step 1: Verify final directory structure**

```bash
find src -type d | sort
```

Expected directories:
```
src
src/api
src/assets
src/assets/sounds
src/assets/sounds/ranks
src/audio
src/components
src/config
src/contexts
src/db
src/game
src/hooks
src/lib
src/navigation
src/queries
src/screens
src/utils
```

Directories that must NOT appear: `src/logic`, `src/services`.

- [ ] **Step 2: Verify no orphan files remain in removed dirs**

```bash
find src/logic src/services 2>/dev/null
```
Expected: command errors ("No such file or directory") or empty output.

- [ ] **Step 3: Full TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Full test run**

```bash
npx jest --runInBand
```
Expected: 98/98 pass.

- [ ] **Step 5: Commit final state tag**

```bash
git add -A
git commit -m "chore: directory restructure complete — src/ now follows api/audio/game/utils/config layering"
```

---

## Self-Review

**Spec coverage:**
- ✅ `logic/` split into `audio/`, `game/`, `utils/` — Tasks 2, 3, 4
- ✅ Dead code (`celebrateSound.ts`) removed — Task 1
- ✅ External I/O consolidated into `api/` — Task 5
- ✅ Config files consolidated into `config/` — Task 6
- ✅ Path aliases for future imports — Task 7
- ✅ Final verification — Task 8

**Placeholder scan:** No TBD, TODO, or "similar to Task N" patterns. All commands exact.

**Type consistency:** File names used in task descriptions match exactly (e.g., `rankMascotBridge.ts` not `rankMascotBridge`). Import path patterns consistent throughout.

**Risk note:** Tasks 2–6 all involve import path updates across many files. The grep steps are mandatory — do not skip them. A missed import will cause a TypeScript error caught by the `npx tsc --noEmit` gate at the end of each task. Fix before committing.
