# Activation telemetry specification (design only)

## Scope

This is a design, not an implementation, migration, deployment, or Production write. The
initial collection is deliberately limited to `app_opened`, `habit_create_local_success`, and
`check_in_local_success`. First and return are derived metrics, not events.

QA sandbox events must remain local or be dropped. They must never enter Production funnel
metrics.

## Identity and shared envelope

Use a random installation UUID stored locally for pre-auth events. Report two distinct
populations: authenticated WAU (distinct server-derived `auth.uid()`) and anonymous active
installations (distinct installation UUIDs with no authenticated identity). Do not add them
together as a single WAU number.

Once authenticated, the server derives the durable user identity from `auth.uid()`; the client
must not send email, Google subject, or a claimed user id as analytics identity. A local
`users.account_key` is only an on-device routing key and must not be exported. A signed-in
event can include an installation pseudonym so the server can create a one-way installation ↔
authenticated-user link at the observed sign-in boundary. On sign-out or account switch, close
the old link and start a new link; never attribute pre-auth events or another account's events
to the newly signed-in user retroactively.

Every event has:

| Field | Requirement |
| --- | --- |
| `event_id` | UUID created once at operation start and persisted before upload; unique per logical event. Retries reuse it. |
| `operation_key` | Deterministic dedupe key: launch session, durable task creation id, or durable `activity_key`. It is unique per event kind. |
| `event_name` | Closed enum below. |
| `occurred_at` | Client UTC timestamp in ISO-8601 plus `local_date`, IANA timezone when available, and offset minutes. Server records `received_at` separately. |
| `version_name`, `version_code`, `git_sha` | Build provenance captured at runtime. `git_sha` is nullable unless injected by the build; never infer it from the checkout. |
| `is_qa` | Explicit boolean. QA is local-only and is not uploaded to the Production analytics table. |
| `route` / `entry_surface` | Low-cardinality source such as `cold_start`, `foreground`, `add_sheet`, or `backfill`. No free-form user text. |

When upload is introduced later, the endpoint must derive `user_id` from the verified session,
apply RLS, and enforce unique `(user_id, event_id)` plus a suitable unique operation key.

## Event contracts

| Event | Emit only after | Stable operation key | Required outcome fields |
| --- | --- | --- | --- |
| `app_opened` | Database/app shell is usable, once per foreground session (define a 30-minute inactive boundary) | `open:<installation_id>:<session_id>` | auth state, session kind, installation pseudonym, build envelope |
| `habit_create_local_success` | `task_types` transaction commits | `habit:<creation_event_id>` | task kind/time-based flag, creation route, `local_status=committed` |
| `check_in_local_success` | the append-only `activity_log` transaction commits | `checkin:<activity_key>` | task kind, duration bucket, backfill flag, `activity_local_date`, `local_status=committed` |

`sync_confirmed` is explicitly deferred. Every initial event represents only a local commit;
cloud state stays `not_observed` rather than being inferred from `requestCurrentUserSync()`.
If a later sync event is approved, it must prove the exact task/activity identity in an
acknowledged payload or cloud revision. A local success remains valid if cloud sync fails.

## Operation time versus activity date

`occurred_at` is when the person performed the UI operation. `activity_local_date` is the
date attributed to the resulting `activity_log` entry and may be earlier for backfill. Keep
both fields for every check-in. A backfill entered for another day during the same foreground
session must not count as a return visit, even if its `activity_local_date` differs from the
first observed activity date.

## Durable outbox and deduplication

Create a local telemetry outbox only after a privacy/retention decision. Insert the business
row and its local-success event in the same SQLite transaction. The outbox has `event_id` as
primary key and unique `(event_name, operation_key)`, serialized payload, attempt count, and
local collection state. Upload is deferred. A retry of the same operation may update transport
metadata later but never mints a new event id. Backfill entries use their durable `activity_key`;
they must not share an event id with a normal check-in.

Use a transaction-bound pre-insert count only for a derived flag such as
`first_check_in_observed`. Do not emit completion from UI tap, optimistic query state, or a
generic sync retry.

## First and return semantics

`first_check_in_observed` means the earliest **instrumented, committed** check-in for a user;
it is not proof of their first-ever historical check-in. Existing `activity_log` history can
only seed this status after an explicit cutoff, account-bound identity decision, and a documented
backfill policy. It cannot reconstruct historical app opens or habit creations.

`return_day_check_in_observed` requires a new `app_opened` foreground session on a later
calendar day followed by a committed non-backfill check-in. Derive the session day from
`occurred_at` plus timezone metadata, not `activity_local_date`; UTC midnight alone can move a
user across days. Report users and sample sizes, not a single percentage, and keep
unknown/missing identity out of the authenticated WAU/retention denominator.

## Validation before implementation

1. Add unit tests for one event id across retry, duplicate tap, and process restart.
2. QA normal, timed, new, and backfill paths; assert one outbox row only after a committed
   local write.
3. Verify QA mode produces no network request and no Production event, including retry paths.
4. Run a small staging-only event audit with version segmentation and dedupe queries before
   interpreting any funnel or retention result.
