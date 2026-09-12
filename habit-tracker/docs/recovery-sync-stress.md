# Recovery sync verification

Scope: recovery HEAD `27a4480038ccb0b3f8fa8a66b3a682087d838110`, based on
`08ee7bf`. Runtime code already removes the activity-key schema probe and
fails closed at the durable append/delete RPC boundary. This follow-up adds
verification only; it introduces no migration or runtime change.

## Results (2026-09-10)

| Layer | Evidence | Result and limits |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | PASS |
| Full Jest coverage | Command below, Node 24.14.1 | 110 suites, 1,133 tests, one snapshot PASS; statements/lines 98.60%, functions 97.55%, branches 95.05% |
| New regression repeat | Sync, acknowledgement, challenge coverage suites | 208 tests per run, three consecutive passes (624 total) |
| Focused repeated tests | Five suites below, ten runs | 155 tests per run, 1,550 passes |
| Real SQLite | `activityIdentityMigration.realSqlite.test.ts` | v29 to v35 upgrade preserves legacy fields; 20 reopen/rollback cycles preserve the activity; 20 reopen cycles preserve a committed delete intent |
| Mock transport | `syncService.test.ts`, pending-delete suites | Missing RPC leaves cursor/outbox pending; retry and concurrent account/delete cases pass. This is not network evidence from Android |
| Real local Auth/RPC | `node scripts/stress-local-activity.cjs` | Final run: 20 cycles, 364 HTTP requests; eight concurrent appends converge to one row; concurrent deletes and retry converge to zero; append/delete race converges after final delete replay |
| Android sync | Not run in this follow-up | Existing APK embeds production. A local-endpoint APK and local Auth route through the app remain required |
| Release | Not attempted in this follow-up | Signed/optimized AAB remains a release prerequisite, not a draft-PR prerequisite |

Focused command:

```powershell
npx.cmd jest --runInBand __tests__/activityIdentityMigration.realSqlite.test.ts __tests__/restoreOutbox.realSqlite.test.ts __tests__/pendingActivityDeletes.race.test.ts __tests__/pendingActivityDeletes.test.ts __tests__/syncService.test.ts --silent
```

Full coverage command (2026-09-10 follow-up):

```powershell
node --no-opt node_modules/jest/bin/jest.js --runInBand --coverage --silent --coverageReporters=text-summary --coverageReporters=json-summary
```

The ordinary Node 24 coverage run crashed in V8 with `Fatal error unreachable
code`. Disabling optimizing JIT for this test process completed successfully;
this is a test-runner workaround, not an Android runtime or release-toolchain
fix. Jest's existing V8 provider, collection configuration and 95% thresholds
were not changed. Percentages describe the modules collected by that Jest
configuration, not every source file in the repository, and do not imply that
each individual module exceeds 95%.

The reproduced weekly-challenge test failure came from using the real current
date against a September 1 fixture while expecting week 1. The test now freezes
time separately in weeks 1 and 2 and restores real timers in `finally`; no
challenge runtime logic changed. Added sync/outbox tests verify malformed,
empty and foreign acknowledgements, unchanged append payload on retry,
cancellation before local acknowledgement, legacy receipts, and bounded batch
limits. The new outbox suite uses mock transport/SQLite and asserts the exact
identity-bound DELETE parameters; real SQLite evidence remains separate above.

The RPC harness is deliberately pinned to loopback port 54321 and the existing
Docker stack `habi-staging-local-20260907-r4`. It reads local Docker credentials
in memory, creates a unique confirmed password-auth fixture, signs in through
GoTrue, and uses that returned session for RPC calls. Admin credentials are used
only for fixture creation/deletion. All concurrent calls settle before cleanup.
It removes the generated Auth account in `finally`. Never point this harness at
production. The installed RPC definitions were exercised; this is not proof of
clean migration replay from repository SQL.

The first local session was rejected with `401/PGRST303: JWT issued at future`.
A fixed 1.5-second wait was insufficient on a subsequent run. The final harness
uses a read-only REST preflight, with at most ten one-second retries for that
specific clock error before any activity writes. The final run passed. This is a
test-environment workaround, not a production Auth fix. The other local instance
on port 55421 lacks the append/delete-key RPCs; no schemas were altered.

## Remaining work

- Build a new APK with the local endpoint and verify the actual embedded host.
- Exercise app Auth and sync, offline-to-online, app-process restart, and missing
  RPC while observing pending SQLite state and network methods. Database reopen
  tests are not Android restart evidence. No HEAD in this harness proves only
  the harness's methods, not the app's runtime behavior.
- `user_data_backup_history` and `u.updated_at`: diagnostic execution paths were
  previously identified, but the originating scripts remain unavailable. Neither
  diagnostic bug is fixed by this follow-up; no substitute diagnostic file edited.
- Review the parent activity-identity PR and this stacked draft before merge.
  The remote parent has a later QA-network-profile commit not imported into this
  recovery checkout. No merge, deploy, version bump, or production request made.
- The full-suite date-sensitive failure is now fixed and coverage is above 95%
  on all four global metrics. This does not close the diagnostic-source,
  Android integration, or signed/optimized release-artifact gaps above.

Review: manually checked test cleanup, transaction assertions, endpoint boundary,
credential handling, fixture isolation and concurrent-request cleanup. This is
not an independent multi-agent review or release approval.

## Android and release verification (2026-09-13)

The recovery branch now includes the parent branch's dedicated `qa` Android
variant. It inherits release signing but disables shrinking, and its manifest
permits cleartext traffic only to the emulator host `10.0.2.2`. The production
release manifest and release shrinker setting remain unchanged. A regression
test enforces these boundaries.

The local QA APK was built with a loopback Supabase URL, installed on the fresh
Android 34 AVD `Codex_Local_402_20260912`, and the installed package matched the
built APK byte-for-byte. The app reached the native Google account chooser and
completed 20 independent process starts with 20 distinct process IDs and no
`FATAL EXCEPTION`, `ReactNativeJS` error, or bundle-load failure. This proves
installation, cold-start stability, and native Auth-provider routing. It does
not prove an authenticated app sync because no test Google account was entered.

The signed, minified release AAB completed `bundleRelease` under JDK 17 with R8
enabled and embeds project `ebprkyplvqexzpwfasjq`; it was not installed and no
production request was sent. Reproducible commands, tool versions, sanitized
environment metadata, build logs, artifact checksums, and signature checks are
kept in the local audit record generated after the final source commit.

The real loopback GoTrue/PostgREST stress harness remains the backend integration
evidence: password Auth, append, concurrent retry, delete, and append/delete race
all passed against the permitted local stack. The missing-RPC pending behavior
is covered by Jest and real SQLite reopen tests, not by an authenticated APK run.

`user_data_backup_history` and `u.updated_at` remain unchanged: the originating
diagnostic scripts are unavailable, so no unrelated diagnostic file was edited
as a substitute. The draft PR remains unmerged and undeployed; no version was
bumped.
