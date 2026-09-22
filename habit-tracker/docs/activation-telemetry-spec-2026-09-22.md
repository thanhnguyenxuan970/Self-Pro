# Activation telemetry specification (design only)

## Scope

This is a design, not an implementation, migration, deployment, or Production write. It
measures the observed path `app open -> habit created -> first check-in -> check-in on a
different local day`, while preserving the distinction between a committed local write and
a confirmed cloud sync.

QA sandbox events must remain local or be dropped. They must never enter Production funnel
metrics.

## Identity and shared envelope

Use a random installation UUID stored locally for pre-auth events. Once authenticated, the
server derives the durable user identity from `auth.uid()`; the client must not send email,
Google subject, or a claimed user id as analytics identity. A local `users.account_key` is
only an on-device routing key and must not be exported as an analytics identifier.

Every event has:

| Field | Requirement |
| --- | --- |
| `event_id` | UUID created once at operation start and persisted before upload; unique per logical event. Retries reuse it. |
| `operation_key` | Deterministic dedupe key: launch session, durable task creation id, or durable `activity_key`. It is unique per event kind. |
| `event_name` | Closed enum below. |
| `occurred_at` | Client UTC timestamp in ISO-8601 plus `local_date`, IANA timezone when available, and offset minutes. Server records `received_at` separately. |
| `version_name`, `version_code`, `git_sha` | Build provenance captured at runtime. `git_sha` is nullable unless injected by the build; never infer it from the checkout. |
| `is_qa` | Explicit boolean. QA is not uploaded to the Production analytics table. |
| `route` / `entry_surface` | Low-cardinality source such as `cold_start`, `foreground`, `add_sheet`, or `backfill`. No free-form user text. |

The upload endpoint derives `user_id` from the verified session, applies RLS, and enforces
unique `(user_id, event_id)` plus a suitable unique operation key. It must reject client
claims of `sync_confirmed`.

## Event contracts

| Event | Emit only after | Stable operation key | Required outcome fields |
| --- | --- | --- | --- |
| `app_opened` | Database/app shell is usable, once per foreground session (define a 30-minute inactive boundary) | `open:<installation_id>:<session_id>` | auth state, session kind, build envelope |
| `habit_create_local_success` | `task_types` transaction commits | `habit:<creation_event_id>` | task kind/time-based flag, creation route, `local_status=committed` |
| `check_in_local_success` | the append-only `activity_log` transaction commits | `checkin:<activity_key>` | task kind, duration bucket, backfill flag, local date, `local_status=committed` |
| `habit_create_sync_confirmed` | cloud acknowledgement proves that exact task is present | same creation event with a distinct event name, or a state transition stored against it | cloud revision/ack id, `sync_status=confirmed` |
| `check_in_sync_confirmed` | cloud acknowledgement proves the same `activity_key` is present | `checkin-sync:<activity_key>` | cloud revision/ack id, `sync_status=confirmed` |

`requestCurrentUserSync()` resolving is not enough to emit a sync-success event: batching or
a later conflict can omit the operation. Confirm the task/activity identity in the acknowledged
payload or a cloud revision that contains it. A local success remains valid if sync later fails.

## Durable outbox and deduplication

Create a local telemetry outbox only after a privacy/retention decision. Insert the business
row and its local-success event in the same SQLite transaction. The outbox has `event_id` as
primary key and unique `(event_name, operation_key)`, serialized payload, attempt count,
last error class, and upload state. A retry may update transport metadata but never mint a new
event id. Backfill entries use their durable `activity_key`; they must not share an event id
with a normal check-in.

Use a transaction-bound pre-insert count only for a derived flag such as
`first_check_in_observed`. Do not emit completion from UI tap, optimistic query state, or a
generic sync retry.

## First and return semantics

`first_check_in_observed` means the earliest **instrumented, committed** check-in for a user;
it is not proof of their first-ever historical check-in. Existing `activity_log` history can
only seed this status after an explicit cutoff, account-bound identity decision, and a documented
backfill policy. It cannot reconstruct historical app opens or habit creations.

`return_day_check_in_observed` requires a committed check-in whose `local_date` differs from
the earliest observed check-in date. Calculate cohorts server-side using event local date and
timezone metadata; UTC midnight alone can move a user across days. Report users and sample
sizes, not a single percentage, and keep events with unknown/missing identity out of the
authenticated WAU/retention denominator.

## Validation before implementation

1. Add unit tests for one event id across retry, duplicate tap, and process restart.
2. QA normal, timed, new, and backfill paths; assert one outbox row only after a committed
   local write.
3. Verify QA mode produces no network request and no Production event.
4. Validate cloud acknowledgements against exact `activity_key`/task identity before marking
   sync confirmed.
5. Run a small staging-only event audit with version segmentation and dedupe queries before
   interpreting any funnel or retention result.
