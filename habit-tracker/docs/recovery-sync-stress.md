# Recovery sync verification

Scope: recovery HEAD `27a4480038ccb0b3f8fa8a66b3a682087d838110`, based on
`08ee7bf`. Runtime code already removes the activity-key schema probe and
fails closed at the durable append/delete RPC boundary. This follow-up adds
verification only; it introduces no migration or runtime change.

## Results (2026-09-10)

| Layer | Evidence | Result and limits |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | PASS |
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
- Full-suite prior date-sensitive failure in `useChallenge.coverage.test.ts`
  remains outside this change; the full suite was not repeated here.

Review: manually checked test cleanup, transaction assertions, endpoint boundary,
credential handling, fixture isolation and concurrent-request cleanup. This is
not an independent multi-agent review or release approval.
