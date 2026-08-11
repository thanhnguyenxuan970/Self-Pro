"""Run migrations 029-032 against a fresh PostgreSQL 16 cluster.

The runner intentionally executes the production migration files, not a SQL
reference model. Install `supabase/tests/requirements.txt`, then provide either:

* HABI_POSTGRES_BIN pointing at a PostgreSQL bin directory, or
* initdb/pg_ctl available on PATH.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid

import psycopg


HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"
PREVIOUS_MIGRATIONS = (
    "020_lifetime_global_leaderboard.sql",
    "021_secure_lifetime_leaderboard.sql",
    "022_redact_leaderboard_emails.sql",
    "023_leaderboard_compatibility.sql",
    "024_preserve_legacy_leaderboard_identity.sql",
    "026_leaderboard_rank_neighborhood.sql",
    "027_provision_leaderboard_profiles.sql",
    "028_leaderboard_streak_signal.sql",
)
FRIEND_MIGRATIONS = (
    "029_social_identity_bridge.sql",
    "030_friend_relationships.sql",
    "031_friend_dashboard.sql",
    "032_friend_blocked_accounts.sql",
)


class CheckFailure(AssertionError):
    pass


class Checks:
    def __init__(self) -> None:
        self.total = 0
        self.failed: list[str] = []

    def equal(self, name: str, got: object, want: object) -> None:
        self.total += 1
        if got == want:
            print(f"PASS  {name}")
            return
        message = f"{name}: got={got!r}, want={want!r}"
        self.failed.append(message)
        print(f"FAIL  {message}")

    def true(self, name: str, value: object) -> None:
        self.equal(name, bool(value), True)

    def summary(self) -> None:
        passed = self.total - len(self.failed)
        print("\n" + "=" * 72)
        print(f"{passed}/{self.total} passed")
        if self.failed:
            raise CheckFailure("\n".join(self.failed))


def postgres_bin() -> pathlib.Path:
    configured = os.environ.get("HABI_POSTGRES_BIN")
    if configured:
        candidate = pathlib.Path(configured)
    else:
        initdb = shutil.which("initdb")
        if initdb:
            candidate = pathlib.Path(initdb).parent
        elif os.name == "nt":
            candidate = pathlib.Path(os.environ["TEMP"]) / "habi-postgresql-16.2" / "pgsql" / "bin"
        else:
            candidate = pathlib.Path("/usr/lib/postgresql/16/bin")
    executable = candidate / ("initdb.exe" if os.name == "nt" else "initdb")
    if not executable.exists():
        raise RuntimeError(f"PostgreSQL initdb not found under {candidate}")
    return candidate


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class FreshPostgres:
    def __init__(self) -> None:
        # Windows initdb refuses to create a data directory beneath an already
        # existing TemporaryDirectory. Give it a verified non-existent path.
        self.data = pathlib.Path(os.environ.get("TEMP", ".")) / f"habi-friends-pg-{uuid.uuid4().hex}"
        self.bin = postgres_bin()
        self.port = free_port()
        self.uri = f"postgresql://postgres@127.0.0.1:{self.port}/postgres"

    def command(self, name: str) -> str:
        suffix = ".exe" if os.name == "nt" else ""
        return str(self.bin / f"{name}{suffix}")

    def __enter__(self) -> FreshPostgres:
        subprocess.run(
            [
                self.command("initdb"),
                "-D",
                str(self.data),
                "-U",
                "postgres",
                "-A",
                "trust",
                "--encoding=UTF8",
                "--no-locale",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            [
                self.command("pg_ctl"),
                "-D",
                str(self.data),
                "-l",
                str(self.data / "postgres.log"),
                "-o",
                f"-F -p {self.port} -h 127.0.0.1",
                "-w",
                "start",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        subprocess.run(
            [self.command("pg_ctl"), "-D", str(self.data), "-m", "immediate", "-w", "stop"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        expected_prefix = "habi-friends-pg-"
        if self.data.name.startswith(expected_prefix) and self.data.parent == pathlib.Path(os.environ.get("TEMP", ".")):
            shutil.rmtree(self.data, ignore_errors=True)


def read_sql(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def execute_file(cur: psycopg.Cursor[object], path: pathlib.Path) -> None:
    cur.execute(read_sql(path))


def set_user(cur: psycopg.Cursor[object], user_id: uuid.UUID, email: str, name: str | None = None) -> None:
    metadata = {"user_metadata": {"full_name": name}} if name is not None else {"user_metadata": {}}
    cur.execute("SELECT set_config('test.uid', %s, false)", (str(user_id),))
    cur.execute("SELECT set_config('test.email', %s, false)", (email,))
    cur.execute("SELECT set_config('test.jwt', %s, false)", (json.dumps(metadata),))


def scalar(cur: psycopg.Cursor[object], sql: str, params: tuple[object, ...] = ()) -> object:
    cur.execute(sql, params)
    row = cur.fetchone()
    return None if row is None else row[0]


def status(cur: psycopg.Cursor[object], function_call: str, params: tuple[object, ...]) -> tuple[str, int | None]:
    cur.execute(f"SELECT status, retry_after_seconds FROM {function_call}", params)
    row = cur.fetchone()
    if row is None:
        raise CheckFailure(f"{function_call} returned no row")
    return str(row[0]), None if row[1] is None else int(row[1])


def expect_error(cur: psycopg.Cursor[object], sql: str, params: tuple[object, ...] = ()) -> bool:
    try:
        cur.execute(sql, params)
        return False
    except psycopg.Error:
        return True


def succeeds(cur: psycopg.Cursor[object], sql: str, params: tuple[object, ...] = ()) -> bool:
    try:
        cur.execute(sql, params)
        return True
    except psycopg.Error:
        return False


@contextmanager
def database_role(cur: psycopg.Cursor[object], role: str) -> Iterator[None]:
    if role not in ("authenticated", "anon"):
        raise ValueError(f"Unexpected database role: {role}")
    cur.execute(f"SET ROLE {role}")
    try:
        yield
    finally:
        cur.execute("RESET ROLE")


def reset_pre_029(cur: psycopg.Cursor[object]) -> None:
    execute_file(cur, HERE / "pre_029_fixture.sql")
    for migration in PREVIOUS_MIGRATIONS:
        execute_file(cur, MIGRATIONS / migration)


def seed_auth_user(
    cur: psycopg.Cursor[object],
    email: str,
    metadata: dict[str, object] | None = None,
) -> uuid.UUID:
    user_id = uuid.uuid4()
    cur.execute(
        "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (%s, %s, %s::jsonb)",
        (user_id, email, json.dumps(metadata or {})),
    )
    return user_id


def apply_friend_migration(cur: psycopg.Cursor[object], migration: str) -> None:
    if migration not in FRIEND_MIGRATIONS:
        raise ValueError(f"Unexpected friend migration: {migration}")
    execute_file(cur, MIGRATIONS / migration)


def test_identity_migration(cur: psycopg.Cursor[object], checks: Checks) -> dict[str, tuple[uuid.UUID, str]]:
    print("\n== migration 029: auth identity bridge ==")
    users: dict[str, tuple[uuid.UUID, str]] = {}
    for name in ("an", "binh", "cuong", "dung"):
        email = f"{name}@example.com"
        users[name] = (seed_auth_user(cur, email), email)

    an_id, an_email = users["an"]
    cur.execute(
        "INSERT INTO activity_log (user_email, local_id, stars_delta) VALUES (%s, 1, 2)",
        (an_email,),
    )
    cur.execute(
        "INSERT INTO fund_transactions (user_email, local_id, amount) VALUES (%s, 1, 3)",
        (an_email,),
    )

    apply_friend_migration(cur, "029_social_identity_bridge.sql")

    checks.equal(
        "all existing profiles backfill auth_user_id",
        scalar(cur, "SELECT count(*) FROM users WHERE auth_user_id IS NOT NULL"),
        4,
    )
    checks.equal(
        "auth UUID is unique and non-null",
        scalar(
            cur,
            """SELECT count(*) FROM pg_constraint
                 WHERE conrelid='public.users'::regclass
                   AND contype IN ('u','f')
                   AND conname IN ('users_auth_user_id_key','users_auth_user_id_fkey')""",
        ),
        2,
    )
    checks.true(
        "legacy sync_user_profile(integer) remains callable",
        bool(scalar(cur, "SELECT to_regprocedure('public.sync_user_profile(integer)') IS NOT NULL")),
    )
    checks.true(
        "global leaderboard v2 signature remains callable",
        bool(scalar(cur, "SELECT to_regprocedure('public.get_global_leaderboard_v2(integer)') IS NOT NULL")),
    )

    new_email = "an.renamed@example.com"
    cur.execute("UPDATE auth.users SET email=%s WHERE id=%s", (new_email, an_id))
    checks.equal(
        "auth email change reconciles public profile",
        scalar(cur, "SELECT user_email FROM users WHERE auth_user_id=%s", (an_id,)),
        new_email,
    )
    checks.equal(
        "auth email change reconciles activity rows",
        scalar(cur, "SELECT user_email FROM activity_log WHERE local_id=1"),
        new_email,
    )
    checks.equal(
        "auth email change reconciles fund rows",
        scalar(cur, "SELECT user_email FROM fund_transactions WHERE local_id=1"),
        new_email,
    )
    users["an"] = (an_id, new_email)

    newcomer = seed_auth_user(cur, "new@example.com")
    checks.equal(
        "new auth account is provisioned with stable UUID",
        scalar(cur, "SELECT auth_user_id FROM users WHERE user_email='new@example.com'"),
        newcomer,
    )
    checks.true(
        "email collision is rejected rather than merged",
        expect_error(cur, "UPDATE auth.users SET email=%s WHERE id=%s", (users["binh"][1], newcomer)),
    )
    cur.execute("DELETE FROM auth.users WHERE id=%s", (newcomer,))
    return users


def test_relationship_constraints(cur: psycopg.Cursor[object], checks: Checks, users: dict[str, tuple[uuid.UUID, str]]) -> None:
    print("\n== migration 030: canonical relationship constraints and privileges ==")
    apply_friend_migration(cur, "030_friend_relationships.sql")
    a = users["an"][0]
    b = users["binh"][0]
    c = users["cuong"][0]
    lo, hi = sorted((a, b))
    insert = """INSERT INTO friend_relationships
      (user_a_id,user_b_id,state,requested_by,blocked_by,accepted_at,expires_at)
      VALUES (%s,%s,%s,%s,%s,%s,%s)"""
    illegal = (
        (hi, lo, "pending", hi, None, None, "2099-01-01"),
        (lo, hi, "pending", lo, None, None, None),
        (lo, hi, "pending", lo, None, "2020-01-01", "2099-01-01"),
        (lo, hi, "accepted", lo, None, None, None),
        (lo, hi, "accepted", lo, None, "2020-01-01", "2099-01-01"),
        (lo, hi, "blocked", None, None, None, None),
        (lo, hi, "pending", c, None, None, "2099-01-01"),
        (lo, hi, "frenemy", lo, None, None, "2099-01-01"),
    )
    for index, params in enumerate(illegal, start=1):
        checks.true(f"illegal relationship row {index} is rejected", expect_error(cur, insert, params))
    checks.equal(
        "authenticated has no direct relationship table access",
        scalar(cur, "SELECT has_table_privilege('authenticated','public.friend_relationships','SELECT')"),
        False,
    )
    checks.equal(
        "authenticated has no direct attempt table access",
        scalar(cur, "SELECT has_table_privilege('authenticated','public.friend_code_attempts','SELECT')"),
        False,
    )
    checks.equal(
        "production request RPC has no lock-bypass test parameter",
        scalar(cur, "SELECT to_regprocedure('public.request_friend_by_code(text,boolean)') IS NULL"),
        True,
    )
    checks.equal(
        "authenticated can execute the narrow request RPC",
        scalar(cur, "SELECT has_function_privilege('authenticated','public.request_friend_by_code(text)','EXECUTE')"),
        True,
    )
    checks.equal(
        "anon cannot execute the request RPC",
        scalar(cur, "SELECT has_function_privilege('anon','public.request_friend_by_code(text)','EXECUTE')"),
        False,
    )
    checks.equal(
        "authenticated cannot execute the pair-lock helper",
        scalar(cur, "SELECT has_function_privilege('authenticated','public.friend_pair_lock(uuid,uuid)','EXECUTE')"),
        False,
    )


def assign_codes(cur: psycopg.Cursor[object], users: dict[str, tuple[uuid.UUID, str]]) -> dict[str, str]:
    codes = {"an": "AAAAAA", "binh": "BBBBBB", "cuong": "CCCCCC", "dung": "DDDDDD"}
    for name, code in codes.items():
        cur.execute("UPDATE users SET friend_code=%s WHERE auth_user_id=%s", (code, users[name][0]))
    return codes


def request(cur: psycopg.Cursor[object], actor: tuple[uuid.UUID, str], code: str) -> tuple[str, int | None]:
    set_user(cur, actor[0], actor[1], actor[1].split("@")[0])
    return status(cur, "request_friend_by_code(%s)", (code,))


def test_codes_and_transitions(cur: psycopg.Cursor[object], checks: Checks, users: dict[str, tuple[uuid.UUID, str]]) -> None:
    print("\n== migration 030: codes, consent, block precedence, lifecycle ==")
    codes = assign_codes(cur, users)
    set_user(cur, *users["an"], name="An")
    first = scalar(cur, "SELECT get_or_create_my_friend_code()")
    second = scalar(cur, "SELECT get_or_create_my_friend_code()")
    checks.equal("friend code is persistent", second, first)
    checks.true("friend code uses six allowed characters", isinstance(first, str) and len(first) == 6 and all(ch in "23456789ABCDEFGHJKMNPQRSTUVWXYZ" for ch in first))
    rotated = scalar(cur, "SELECT rotate_my_friend_code()")
    checks.true("rotating changes the friend code", rotated != first)
    cur.execute("UPDATE users SET friend_code=%s WHERE auth_user_id=%s", (codes["an"], users["an"][0]))

    checks.equal("own code returns SELF", request(cur, users["an"], codes["an"])[0], "SELF")
    checks.equal("malformed code returns NOT_FOUND", request(cur, users["an"], "IIIIII")[0], "NOT_FOUND")
    checks.equal("lowercase code is normalized", request(cur, users["an"], codes["binh"].lower())[0], "PENDING")
    checks.equal("same-direction repeat is ALREADY_PENDING", request(cur, users["an"], codes["binh"])[0], "ALREADY_PENDING")
    checks.equal("reciprocal request auto-accepts", request(cur, users["binh"], codes["an"])[0], "ACCEPTED")
    checks.equal("canonical pair remains one row", scalar(cur, "SELECT count(*) FROM friend_relationships"), 1)
    checks.equal("accepted repeat is ALREADY_FRIENDS", request(cur, users["an"], codes["binh"])[0], "ALREADY_FRIENDS")

    relationship = scalar(cur, "SELECT id FROM friend_relationships")
    set_user(cur, *users["an"], name="An")
    checks.equal("participant can block", scalar(cur, "SELECT status FROM block_friend(%s)", (relationship,)), "OK")
    checks.equal("blocked target is indistinguishable from unknown", request(cur, users["binh"], codes["an"])[0], "NOT_FOUND")
    set_user(cur, *users["binh"], name="Binh")
    checks.equal("non-blocker cannot unblock", scalar(cur, "SELECT status FROM unblock_friend(%s)", (relationship,)), "FORBIDDEN")
    set_user(cur, *users["an"], name="An")
    checks.equal("blocker can unblock", scalar(cur, "SELECT status FROM unblock_friend(%s)", (relationship,)), "OK")

    checks.equal("new request can be rejected", request(cur, users["an"], codes["cuong"])[0], "PENDING")
    relationship = scalar(cur, "SELECT id FROM friend_relationships")
    set_user(cur, *users["cuong"], name="Cuong")
    checks.equal("recipient can reject", scalar(cur, "SELECT status FROM respond_to_friend_request(%s,'reject')", (relationship,)), "OK")
    checks.equal("reject deletes pending row", scalar(cur, "SELECT count(*) FROM friend_relationships"), 0)

    checks.equal("new request can be cancelled", request(cur, users["an"], codes["cuong"])[0], "PENDING")
    relationship = scalar(cur, "SELECT id FROM friend_relationships")
    set_user(cur, *users["an"], name="An")
    checks.equal("requester can cancel", scalar(cur, "SELECT status FROM cancel_friend_request(%s)", (relationship,)), "OK")
    checks.equal("cancel deletes pending row", scalar(cur, "SELECT count(*) FROM friend_relationships"), 0)


def create_target(cur: psycopg.Cursor[object], index: int) -> tuple[uuid.UUID, str, str]:
    email = f"target{index}@example.com"
    user_id = seed_auth_user(cur, email)
    alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    number = index
    chars: list[str] = []
    for _ in range(5):
        chars.append(alphabet[number % len(alphabet)])
        number //= len(alphabet)
    code = "R" + "".join(chars)
    cur.execute("UPDATE users SET friend_code=%s WHERE auth_user_id=%s", (code, user_id))
    return user_id, email, code


def test_dual_rate_limits(cur: psycopg.Cursor[object], checks: Checks, users: dict[str, tuple[uuid.UUID, str]]) -> None:
    print("\n== migration 030: separate probe and relationship budgets ==")
    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    got = [request(cur, users["an"], "ZZZZZZ")[0] for _ in range(11)]
    checks.equal("first ten failed probes are allowed", got[:10], ["NOT_FOUND"] * 10)
    checks.equal("eleventh failed probe is rate limited", got[10], "RATE_LIMITED")
    checks.equal(
        "only failed probes are persisted in probe bucket",
        scalar(cur, "SELECT count(*) FROM friend_code_attempts WHERE kind='probe_failure'"),
        10,
    )
    retry = request(cur, users["an"], "ZZZZZZ")[1]
    checks.true("probe rate limit returns exact positive retry window", retry is not None and 1 <= retry <= 3600)

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    targets = [create_target(cur, 100 + index) for index in range(21)]
    pending = [request(cur, users["an"], target[2])[0] for target in targets]
    checks.equal("twenty outgoing pending requests are allowed", pending[:20], ["PENDING"] * 20)
    checks.equal("outgoing pending cap blocks the twenty-first", pending[20], "PENDING_LIMIT_REACHED")
    checks.equal(
        "valid relationship creation does not consume probe budget",
        scalar(cur, "SELECT count(*) FROM friend_code_attempts WHERE kind='probe_failure'"),
        0,
    )
    checks.equal(
        "successful relationship changes use their own budget",
        scalar(cur, "SELECT count(*) FROM friend_code_attempts WHERE kind='relationship_created'"),
        20,
    )

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    reciprocal_targets = [create_target(cur, 200 + index) for index in range(31)]
    for target_id, target_email, _ in reciprocal_targets:
        request(cur, (target_id, target_email), "AAAAAA")
    accepted = [request(cur, users["an"], target[2])[0] for target in reciprocal_targets]
    checks.equal("thirty relationship changes per hour are allowed", accepted[:30], ["ACCEPTED"] * 30)
    checks.equal("thirty-first relationship change is rate limited", accepted[30], "RATE_LIMITED")
    retry = request(cur, users["an"], reciprocal_targets[30][2])[1]
    checks.true("success rate limit returns exact positive retry window", retry is not None and 1 <= retry <= 3600)


def insert_relationship(
    cur: psycopg.Cursor[object],
    first: uuid.UUID,
    second: uuid.UUID,
    state: str,
    requested_by: uuid.UUID,
    *,
    expired: bool = False,
) -> uuid.UUID:
    user_a, user_b = sorted((first, second))
    relationship_id = uuid.uuid4()
    if state == "pending":
        expires = "now() - interval '1 second'" if expired else "now() + interval '30 days'"
        cur.execute(
            f"""INSERT INTO friend_relationships
              (id,user_a_id,user_b_id,state,requested_by,expires_at)
              VALUES (%s,%s,%s,'pending',%s,{expires})""",
            (relationship_id, user_a, user_b, requested_by),
        )
    elif state == "accepted":
        cur.execute(
            """INSERT INTO friend_relationships
              (id,user_a_id,user_b_id,state,requested_by,accepted_at)
              VALUES (%s,%s,%s,'accepted',%s,now())""",
            (relationship_id, user_a, user_b, requested_by),
        )
    else:
        raise ValueError(f"Unsupported test relationship state: {state}")
    return relationship_id


def test_caps_expiry_and_mutations(
    cur: psycopg.Cursor[object],
    checks: Checks,
    users: dict[str, tuple[uuid.UUID, str]],
) -> None:
    print("\n== migration 030: expiry-aware caps and explicit mutations ==")
    an_id = users["an"][0]
    binh_id = users["binh"][0]
    assign_codes(cur, users)

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    expired_outgoing = [create_target(cur, 400 + index) for index in range(20)]
    for target_id, _, _ in expired_outgoing:
        insert_relationship(cur, an_id, target_id, "pending", an_id, expired=True)
    fresh_target = create_target(cur, 421)
    checks.equal(
        "expired outgoing requests do not consume the 20-request cap",
        request(cur, users["an"], fresh_target[2])[0],
        "PENDING",
    )

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    expired_incoming = [create_target(cur, 500 + index) for index in range(50)]
    for requester_id, _, _ in expired_incoming:
        insert_relationship(cur, requester_id, binh_id, "pending", requester_id, expired=True)
    checks.equal(
        "expired incoming requests do not consume the 50-request cap",
        request(cur, users["an"], "BBBBBB")[0],
        "PENDING",
    )

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    active_incoming = [create_target(cur, 600 + index) for index in range(50)]
    for requester_id, _, _ in active_incoming:
        insert_relationship(cur, requester_id, binh_id, "pending", requester_id)
    checks.equal(
        "active incoming cap blocks request 51",
        request(cur, users["an"], "BBBBBB")[0],
        "PENDING_LIMIT_REACHED",
    )

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    accepted_friends = [create_target(cur, 700 + index) for index in range(100)]
    for friend_id, _, _ in accepted_friends:
        insert_relationship(cur, an_id, friend_id, "accepted", an_id)
    checks.equal("a capped user can still create a pending request", request(cur, users["an"], "BBBBBB")[0], "PENDING")
    checks.equal(
        "reciprocal auto-accept enforces the 100-friend cap for both users",
        request(cur, users["binh"], "AAAAAA")[0],
        "FRIEND_LIMIT_REACHED",
    )

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    accepted_friends = [create_target(cur, 800 + index) for index in range(100)]
    for friend_id, _, _ in accepted_friends:
        insert_relationship(cur, an_id, friend_id, "accepted", an_id)
    pending_id = insert_relationship(cur, binh_id, an_id, "pending", binh_id)
    set_user(cur, *users["an"], name="An")
    checks.equal(
        "explicit accept enforces the recipient's 100-friend cap",
        scalar(cur, "SELECT status FROM respond_to_friend_request(%s,'accept')", (pending_id,)),
        "FRIEND_LIMIT_REACHED",
    )

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    checks.equal("request before explicit accept is pending", request(cur, users["an"], "BBBBBB")[0], "PENDING")
    pending_id = scalar(cur, "SELECT id FROM friend_relationships")
    set_user(cur, *users["an"], name="An")
    checks.equal(
        "requester cannot accept their own request",
        scalar(cur, "SELECT status FROM respond_to_friend_request(%s,'accept')", (pending_id,)),
        "FORBIDDEN",
    )
    set_user(cur, *users["binh"], name="Binh")
    checks.equal(
        "recipient can explicitly accept",
        scalar(cur, "SELECT status FROM respond_to_friend_request(%s,'accept')", (pending_id,)),
        "OK",
    )
    set_user(cur, *users["an"], name="An")
    checks.equal("accepted friend can remove relationship", scalar(cur, "SELECT status FROM remove_friend(%s)", (pending_id,)), "OK")
    checks.equal("remove deletes the canonical row", scalar(cur, "SELECT count(*) FROM friend_relationships"), 0)


def test_profile_and_dashboard(cur: psycopg.Cursor[object], checks: Checks, users: dict[str, tuple[uuid.UUID, str]]) -> None:
    print("\n== migration 031: profile freshness, privacy, pending count, ranking ==")
    apply_friend_migration(cur, "031_friend_dashboard.sql")
    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    codes = assign_codes(cur, users)
    profile_data = (
        ("an", 12, "Asia/Ho_Chi_Minh", "today", 100.0, "  An\u0007   Nguyen  "),
        ("binh", 7, "Asia/Ho_Chi_Minh", "yesterday", 100.0, "Binh"),
        ("cuong", 9, "Asia/Ho_Chi_Minh", "old", 80.0, "Cuong"),
        ("dung", 30, "Nowhere/Bogus", "today", 50.0, "Dung"),
    )
    for name, streak, timezone, date_kind, stars, display_name in profile_data:
        user_id, email = users[name]
        set_user(cur, user_id, email, display_name)
        if date_kind == "today":
            date_sql = "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"
        elif date_kind == "yesterday":
            date_sql = "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1"
        else:
            date_sql = "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 2"
        cur.execute(f"SELECT sync_user_profile_v2(%s, {date_sql}, %s)", (streak, timezone))
        cur.execute("UPDATE users SET lifetime_stars=%s WHERE auth_user_id=%s", (stars, user_id))

    checks.equal(
        "display name is sanitized and whitespace-collapsed",
        scalar(cur, "SELECT display_name FROM users WHERE auth_user_id=%s", (users["an"][0],)),
        "An Nguyen",
    )
    checks.equal(
        "invalid timezone is stored as null",
        scalar(cur, "SELECT timezone FROM users WHERE auth_user_id=%s", (users["dung"][0],)),
        None,
    )

    for friend in ("binh", "cuong", "dung"):
        checks.equal(f"request {friend} is pending", request(cur, users["an"], codes[friend])[0], "PENDING")
        checks.equal(f"reciprocal {friend} request accepts", request(cur, users[friend], codes["an"])[0], "ACCEPTED")

    set_user(cur, *users["an"], name="An Nguyen")
    cur.execute(
        "SELECT display_name,effective_streak,lifetime_stars,friend_rank,is_current_user "
        "FROM get_my_friend_dashboard() WHERE section IN ('self','accepted')"
    )
    rows = cur.fetchall()
    by_name = {str(row[0]): row for row in rows}
    checks.equal("dashboard returns self plus three accepted friends", len(rows), 4)
    checks.equal("today keeps streak", by_name["An Nguyen"][1], 12)
    checks.equal("yesterday keeps streak", by_name["Binh"][1], 7)
    checks.equal("two days old yields zero streak", by_name["Cuong"][1], 0)
    checks.equal("invalid timezone yields zero streak", by_name["Dung"][1], 0)
    checks.equal("DENSE_RANK tie for first", (by_name["An Nguyen"][3], by_name["Binh"][3]), (1, 1))
    checks.equal("DENSE_RANK has no gap after tie", (by_name["Cuong"][3], by_name["Dung"][3]), (2, 3))

    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    checks.equal("new outgoing request is pending", request(cur, users["an"], codes["binh"])[0], "PENDING")
    set_user(cur, *users["an"], name="An Nguyen")
    cur.execute("SELECT section,player_id,display_name FROM get_my_friend_dashboard() WHERE section='outgoing'")
    outgoing = cur.fetchone()
    checks.equal("outgoing pending hides recipient identity", outgoing, ("outgoing", None, None))
    set_user(cur, *users["binh"], name="Binh")
    cur.execute("SELECT section,player_id,display_name FROM get_my_friend_dashboard() WHERE section='incoming'")
    incoming = cur.fetchone()
    checks.equal("incoming pending reveals requester identity", incoming[0], "incoming")
    checks.true("incoming requester has public id and name", incoming[1] is not None and incoming[2] == "An Nguyen")
    checks.equal("recipient pending badge counts incoming request", scalar(cur, "SELECT get_friend_pending_count()"), 1)
    set_user(cur, *users["an"], name="An Nguyen")
    checks.equal("requester pending badge excludes outgoing request", scalar(cur, "SELECT get_friend_pending_count()"), 0)

    cur.execute("UPDATE friend_relationships SET expires_at=now()-interval '1 second' WHERE state='pending'")
    set_user(cur, *users["binh"], name="Binh")
    checks.equal("pending count prunes expired requests", scalar(cur, "SELECT get_friend_pending_count()"), 0)
    checks.equal("expired pending row is deleted", scalar(cur, "SELECT count(*) FROM friend_relationships"), 0)

    future_id, future_email = users["cuong"]
    set_user(cur, future_id, future_email, "Cuong")
    cur.execute(
        "SELECT sync_user_profile_v2(99, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, 'Asia/Ho_Chi_Minh')"
    )
    checks.equal(
        "future freshness date is discarded",
        scalar(cur, "SELECT last_active_local_date FROM users WHERE auth_user_id=%s", (future_id,)),
        None,
    )


def test_blocked_accounts_and_pending_consent(
    cur: psycopg.Cursor[object],
    checks: Checks,
    users: dict[str, tuple[uuid.UUID, str]],
) -> None:
    print("\n== migration 032: blocker-owned account list and pending consent ==")
    apply_friend_migration(cur, "032_friend_blocked_accounts.sql")
    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")

    an_id = users["an"][0]
    binh_id = users["binh"][0]
    cuong_id = users["cuong"][0]
    dung_id = users["dung"][0]
    cur.execute(
        """UPDATE users
              SET display_name = CASE auth_user_id
                    WHEN %s THEN %s
                    WHEN %s THEN %s
                    ELSE display_name
                  END
            WHERE auth_user_id IN (%s, %s)""",
        (binh_id, "  Binh\u0007  ", dung_id, " Dung   ", binh_id, dung_id),
    )

    outgoing_id = insert_relationship(cur, an_id, dung_id, "pending", an_id)
    set_user(cur, *users["an"], name="An")
    with database_role(cur, "authenticated"):
        checks.equal(
            "outgoing requester cannot block anonymous recipient",
            scalar(cur, "SELECT status FROM block_friend(%s)", (outgoing_id,)),
            "FORBIDDEN",
        )
    checks.equal(
        "forbidden outgoing block leaves pending row unchanged",
        scalar(
            cur,
            "SELECT (state='pending' AND requested_by=%s AND blocked_by IS NULL) FROM friend_relationships WHERE id=%s",
            (an_id, outgoing_id),
        ),
        True,
    )
    with database_role(cur, "anon"):
        checks.true(
            "anon blocked-list RPC execution is denied",
            expect_error(cur, "SELECT * FROM get_my_blocked_accounts()"),
        )
        checks.true(
            "anon guarded block RPC execution is denied",
            expect_error(cur, "SELECT status FROM block_friend(%s)", (outgoing_id,)),
        )
    cur.execute("DELETE FROM friend_relationships WHERE id=%s", (outgoing_id,))

    blocked_id = insert_relationship(cur, an_id, binh_id, "accepted", an_id)
    with database_role(cur, "authenticated"):
        checks.equal(
            "authenticated accepted participant can still block through SECURITY DEFINER RPC",
            scalar(cur, "SELECT status FROM block_friend(%s)", (blocked_id,)),
            "OK",
        )
    cur.execute(
        "UPDATE friend_relationships SET updated_at='2026-08-11 10:00:00+00' WHERE id=%s",
        (blocked_id,),
    )

    other_blocked_id = insert_relationship(cur, cuong_id, dung_id, "accepted", cuong_id)
    set_user(cur, *users["cuong"], name="Cuong")
    checks.equal(
        "another participant can own a separate blocked row",
        scalar(cur, "SELECT status FROM block_friend(%s)", (other_blocked_id,)),
        "OK",
    )
    cur.execute(
        "UPDATE friend_relationships SET updated_at='2026-08-11 12:00:00+00' WHERE id=%s",
        (other_blocked_id,),
    )

    set_user(cur, *users["an"], name="An")
    with database_role(cur, "authenticated"):
        cur.execute("SELECT relationship_id,display_name FROM get_my_blocked_accounts()")
        checks.equal("blocked list exposes blocker-owned row", cur.fetchall(), [(blocked_id, "Binh")])

    newest_blocked_id = insert_relationship(cur, an_id, dung_id, "accepted", an_id)
    checks.equal(
        "blocker can add a second blocked account",
        scalar(cur, "SELECT status FROM block_friend(%s)", (newest_blocked_id,)),
        "OK",
    )
    cur.execute(
        "UPDATE friend_relationships SET updated_at='2026-08-11 11:00:00+00' WHERE id=%s",
        (newest_blocked_id,),
    )
    cur.execute("SELECT relationship_id,display_name FROM get_my_blocked_accounts()")
    checks.equal(
        "blocked rows sort by updated_at descending with sanitized names",
        cur.fetchall(),
        [(newest_blocked_id, "Dung"), (blocked_id, "Binh")],
    )
    checks.equal(
        "blocked_at retains timestamptz contract",
        scalar(cur, "SELECT pg_typeof(blocked_at)::text FROM get_my_blocked_accounts() LIMIT 1"),
        "timestamp with time zone",
    )

    set_user(cur, *users["binh"], name="Binh")
    with database_role(cur, "authenticated"):
        cur.execute("SELECT relationship_id,display_name FROM get_my_blocked_accounts()")
        checks.equal("authenticated non-blocker sees no blocked rows", cur.fetchall(), [])

    for role in ("authenticated", "anon"):
        for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE"):
            checks.equal(
                f"{role} has no direct relationship table {privilege} privilege",
                scalar(cur, "SELECT has_table_privilege(%s,'public.friend_relationships',%s)", (role, privilege)),
                False,
            )
    checks.equal(
        "authenticated can execute blocked-list RPC",
        scalar(cur, "SELECT has_function_privilege('authenticated','public.get_my_blocked_accounts()','EXECUTE')"),
        True,
    )
    checks.equal(
        "anon cannot execute blocked-list RPC",
        scalar(cur, "SELECT has_function_privilege('anon','public.get_my_blocked_accounts()','EXECUTE')"),
        False,
    )
    checks.equal(
        "authenticated retains guarded block RPC",
        scalar(cur, "SELECT has_function_privilege('authenticated','public.block_friend(uuid)','EXECUTE')"),
        True,
    )
    checks.equal(
        "anon cannot execute guarded block RPC",
        scalar(cur, "SELECT has_function_privilege('anon','public.block_friend(uuid)','EXECUTE')"),
        False,
    )


def join_threads(threads: tuple[threading.Thread, ...], errors: list[str], timeout: float = 10.0) -> None:
    for thread in threads:
        thread.join(timeout=timeout)
    if any(thread.is_alive() for thread in threads):
        errors.append("ThreadTimeout")


def run_pair_races(uri: str, checks: Checks, users: dict[str, tuple[uuid.UUID, str]]) -> None:
    print("\n== concurrent reciprocal first requests use production pair lock ==")
    outcomes: list[str] = []
    errors: list[str] = []
    for _ in range(25):
        with psycopg.connect(uri, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
            cur.execute("UPDATE users SET friend_code='AAAAAA' WHERE auth_user_id=%s", (users["an"][0],))
            cur.execute("UPDATE users SET friend_code='BBBBBB' WHERE auth_user_id=%s", (users["binh"][0],))
        barrier = threading.Barrier(2)

        def worker(actor: tuple[uuid.UUID, str], code: str) -> None:
            try:
                with psycopg.connect(uri) as conn, conn.cursor() as cur:
                    set_user(cur, actor[0], actor[1], actor[1].split("@")[0])
                    barrier.wait(timeout=5)
                    cur.execute("SELECT status FROM request_friend_by_code(%s)", (code,))
                    outcomes.append(str(cur.fetchone()[0]))
                    conn.commit()
            except Exception as error:  # pragma: no cover - printed as evidence
                errors.append(type(error).__name__)

        threads = (
            threading.Thread(target=worker, args=(users["an"], "BBBBBB")),
            threading.Thread(target=worker, args=(users["binh"], "AAAAAA")),
        )
        for thread in threads:
            thread.start()
        join_threads(threads, errors)

    checks.equal("25 reciprocal races complete without database errors", errors, [])
    checks.equal("every reciprocal race returns one PENDING and one ACCEPTED", sorted(outcomes).count("ACCEPTED"), 25)
    checks.equal("every reciprocal race returns exactly one initial PENDING", sorted(outcomes).count("PENDING"), 25)


def run_accept_block_races(uri: str, checks: Checks, users: dict[str, tuple[uuid.UUID, str]]) -> None:
    print("\n== concurrent accept versus recipient block always ends blocked ==")
    errors: list[str] = []
    final_states: list[str] = []
    for _ in range(25):
        with psycopg.connect(uri, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
            relationship_id = insert_relationship(
                cur,
                users["an"][0],
                users["binh"][0],
                "pending",
                users["an"][0],
            )
        barrier = threading.Barrier(2)

        def accept() -> None:
            try:
                with psycopg.connect(uri) as conn, conn.cursor() as cur:
                    set_user(cur, *users["binh"], name="Binh")
                    barrier.wait(timeout=5)
                    cur.execute("SELECT status FROM respond_to_friend_request(%s,'accept')", (relationship_id,))
                    cur.fetchone()
                    conn.commit()
            except Exception as error:  # pragma: no cover - printed as evidence
                errors.append(type(error).__name__)

        def block() -> None:
            try:
                with psycopg.connect(uri) as conn, conn.cursor() as cur:
                    set_user(cur, *users["binh"], name="Binh")
                    barrier.wait(timeout=5)
                    cur.execute("SELECT status FROM block_friend(%s)", (relationship_id,))
                    cur.fetchone()
                    conn.commit()
            except Exception as error:  # pragma: no cover - printed as evidence
                errors.append(type(error).__name__)

        threads = (threading.Thread(target=accept), threading.Thread(target=block))
        for thread in threads:
            thread.start()
        join_threads(threads, errors)
        with psycopg.connect(uri, autocommit=True) as conn, conn.cursor() as cur:
            final_states.append(str(scalar(cur, "SELECT state FROM friend_relationships WHERE id=%s", (relationship_id,))))

    checks.equal("accept/block races complete without database errors", errors, [])
    checks.equal("blocked dominates all 25 accept/block races", final_states, ["blocked"] * 25)
    run_forced_requester_block_after_accept(uri, checks, users)


def run_forced_requester_block_after_accept(
    uri: str,
    checks: Checks,
    users: dict[str, tuple[uuid.UUID, str]],
) -> None:
    print("\n== queued recipient accept before requester block uses locked current row ==")
    with psycopg.connect(uri, autocommit=True) as setup_conn, setup_conn.cursor() as cur:
        cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
        relationship_id = insert_relationship(
            cur,
            users["an"][0],
            users["binh"][0],
            "pending",
            users["an"][0],
        )

    pids: dict[str, int] = {}
    outcomes: dict[str, str] = {}
    errors: list[str] = []
    pid_events = {"accept": threading.Event(), "block": threading.Event()}
    done_events = {"accept": threading.Event(), "block": threading.Event()}

    def mutate(kind: str, actor: tuple[uuid.UUID, str]) -> None:
        try:
            with psycopg.connect(uri) as conn, conn.cursor() as cur:
                set_user(cur, actor[0], actor[1], actor[1].split("@")[0])
                pids[kind] = int(scalar(cur, "SELECT pg_backend_pid()"))
                pid_events[kind].set()
                with database_role(cur, "authenticated"):
                    if kind == "accept":
                        cur.execute("SELECT status FROM respond_to_friend_request(%s,'accept')", (relationship_id,))
                    else:
                        cur.execute("SELECT status FROM block_friend(%s)", (relationship_id,))
                    outcomes[kind] = str(cur.fetchone()[0])
                conn.commit()
        except Exception as error:  # pragma: no cover - printed as evidence
            errors.append(type(error).__name__)
        finally:
            done_events[kind].set()

    with psycopg.connect(uri) as holder, holder.cursor() as holder_cur:
        holder_cur.execute(
            "SELECT friend_pair_lock(%s,%s)",
            (users["an"][0], users["binh"][0]),
        )

        accept_thread = threading.Thread(target=mutate, args=("accept", users["binh"]))
        accept_thread.start()
        accept_started = pid_events["accept"].wait(timeout=2)
        checks.true("recipient accept worker starts", accept_started)
        checks.true(
            "recipient accept queues first behind the pair lock",
            accept_started and wait_for_advisory_lock(holder_cur, pids["accept"]),
        )

        block_thread = threading.Thread(target=mutate, args=("block", users["an"]))
        block_thread.start()
        block_started = pid_events["block"].wait(timeout=2)
        checks.true("outgoing requester block worker starts", block_started)
        checks.equal(
            "outgoing requester block cannot decide before the pair lock is released",
            done_events["block"].wait(timeout=0.25) if block_started else True,
            False,
        )
        holder.commit()

        join_threads((accept_thread, block_thread), errors)

    checks.equal("forced accept/requester-block race has no database errors", errors, [])
    checks.equal("queued recipient accepts first", outcomes.get("accept"), "OK")
    checks.equal("requester blocks after observing accepted current row", outcomes.get("block"), "OK")
    with psycopg.connect(uri, autocommit=True) as conn, conn.cursor() as cur:
        checks.equal(
            "forced accept/requester-block race ends blocked",
            scalar(cur, "SELECT state FROM friend_relationships WHERE id=%s", (relationship_id,)),
            "blocked",
        )


def wait_for_advisory_lock(cur: psycopg.Cursor[object], backend_pid: int) -> bool:
    for _ in range(200):
        waiting = scalar(
            cur,
            "SELECT wait_event = 'advisory' FROM pg_stat_activity WHERE pid=%s",
            (backend_pid,),
        )
        if waiting:
            return True
        time.sleep(0.01)
    return False


def run_remove_block_race(uri: str, checks: Checks, users: dict[str, tuple[uuid.UUID, str]]) -> None:
    print("\n== queued remove versus block still ends blocked ==")
    with psycopg.connect(uri, autocommit=True) as setup_conn, setup_conn.cursor() as cur:
        cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
        relationship_id = insert_relationship(
            cur,
            users["an"][0],
            users["binh"][0],
            "accepted",
            users["an"][0],
        )

    pids: dict[str, int] = {}
    outcomes: dict[str, str] = {}
    errors: list[str] = []
    pid_events = {"remove": threading.Event(), "block": threading.Event()}

    def mutate(kind: str, actor: tuple[uuid.UUID, str]) -> None:
        try:
            with psycopg.connect(uri) as conn, conn.cursor() as cur:
                set_user(cur, actor[0], actor[1], actor[1].split("@")[0])
                pids[kind] = int(scalar(cur, "SELECT pg_backend_pid()"))
                pid_events[kind].set()
                function = "remove_friend" if kind == "remove" else "block_friend"
                cur.execute(f"SELECT status FROM {function}(%s)", (relationship_id,))
                outcomes[kind] = str(cur.fetchone()[0])
                conn.commit()
        except Exception as error:  # pragma: no cover - printed as evidence
            errors.append(type(error).__name__)

    with psycopg.connect(uri) as holder, holder.cursor() as holder_cur:
        holder_cur.execute(
            "SELECT friend_pair_lock(%s,%s)",
            (users["an"][0], users["binh"][0]),
        )

        remove_thread = threading.Thread(target=mutate, args=("remove", users["an"]))
        remove_thread.start()
        pid_events["remove"].wait(timeout=2)
        checks.true("remove is queued behind the held pair lock", wait_for_advisory_lock(holder_cur, pids["remove"]))

        block_thread = threading.Thread(target=mutate, args=("block", users["binh"]))
        block_thread.start()
        pid_events["block"].wait(timeout=2)
        # Give block time to read the existing relationship before it waits on
        # the held pair lock. The final-state assertion proves whether that
        # pre-lock snapshot is safely handled after remove runs first.
        wait_for_advisory_lock(holder_cur, pids["block"])
        checks.true("block worker started while the pair lock is held", pid_events["block"].is_set())
        holder.commit()

        join_threads((remove_thread, block_thread), errors)

    checks.equal("remove/block queue completes without database errors", errors, [])
    checks.equal("remove executes before block in the forced queue", outcomes.get("remove"), "OK")
    with psycopg.connect(uri, autocommit=True) as conn, conn.cursor() as cur:
        checks.equal(
            "block recreates the canonical row after a racing remove",
            scalar(cur, "SELECT state FROM friend_relationships WHERE user_a_id=%s AND user_b_id=%s", tuple(sorted((users["an"][0], users["binh"][0])))),
            "blocked",
        )


def test_account_lifecycle(cur: psycopg.Cursor[object], checks: Checks, users: dict[str, tuple[uuid.UUID, str]]) -> None:
    print("\n== reset and account deletion preserve/cascade correct social state ==")
    cur.execute("DELETE FROM friend_relationships; DELETE FROM friend_code_attempts")
    assign_codes(cur, users)
    request(cur, users["an"], "BBBBBB")
    request(cur, users["binh"], "AAAAAA")
    set_user(cur, *users["an"], name="An")
    cur.execute("SELECT reset_my_progress()")
    checks.equal("reset preserves accepted relationship", scalar(cur, "SELECT count(*) FROM friend_relationships"), 1)
    checks.equal("reset clears social freshness signal", scalar(cur, "SELECT last_active_local_date FROM users WHERE auth_user_id=%s", (users["an"][0],)), None)

    request(cur, users["an"], "ZZZZZZ")
    set_user(cur, *users["an"], name="An")
    cur.execute("SELECT delete_my_account_data()")
    checks.equal("account delete removes profile", scalar(cur, "SELECT count(*) FROM users WHERE auth_user_id=%s", (users["an"][0],)), 0)
    checks.equal("account delete cascades relationships", scalar(cur, "SELECT count(*) FROM friend_relationships"), 0)
    checks.equal("account delete removes limiter rows", scalar(cur, "SELECT count(*) FROM friend_code_attempts WHERE auth_user_id=%s", (users["an"][0],)), 0)

    legacy_id = seed_auth_user(cur, "legacy-return@example.com")
    cur.execute("DELETE FROM users WHERE auth_user_id=%s", (legacy_id,))
    set_user(cur, legacy_id, "legacy-return@example.com", "Legacy Return")
    checks.true(
        "released sync_user_profile can reprovision a deleted profile",
        succeeds(cur, "SELECT sync_user_profile(4)"),
    )
    checks.equal(
        "legacy reprovision restores UUID and streak",
        scalar(cur, "SELECT (auth_user_id=%s AND current_streak=4) FROM users WHERE auth_user_id=%s", (legacy_id, legacy_id)),
        True,
    )

    v2_id = seed_auth_user(cur, "v2-return@example.com")
    cur.execute("DELETE FROM users WHERE auth_user_id=%s", (v2_id,))
    set_user(cur, v2_id, "v2-return@example.com", "V2 Return")
    checks.true(
        "sync_user_profile_v2 can reprovision a deleted profile",
        succeeds(
            cur,
            "SELECT sync_user_profile_v2(6, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'Asia/Ho_Chi_Minh')",
        ),
    )
    checks.equal(
        "v2 reprovision restores UUID, streak, and display name",
        scalar(
            cur,
            "SELECT (auth_user_id=%s AND current_streak=6 AND display_name='V2 Return') FROM users WHERE auth_user_id=%s",
            (v2_id, v2_id),
        ),
        True,
    )


def test_migration_rejections(cur: psycopg.Cursor[object], checks: Checks) -> None:
    print("\n== migration 029 refuses ambiguous or orphaned identity data ==")

    reset_pre_029(cur)
    seed_auth_user(cur, "valid@example.com")
    cur.execute("INSERT INTO users (user_email) VALUES ('orphan@example.com')")
    checks.true(
        "orphaned public profile aborts UUID backfill",
        expect_error(cur, read_sql(MIGRATIONS / "029_social_identity_bridge.sql")),
    )

    reset_pre_029(cur)
    seed_auth_user(cur, "duplicate@example.com")
    cur.execute("INSERT INTO users (user_email) VALUES ('DUPLICATE@example.com')")
    checks.true(
        "duplicate normalized public emails abort UUID backfill",
        expect_error(cur, read_sql(MIGRATIONS / "029_social_identity_bridge.sql")),
    )

    reset_pre_029(cur)
    seed_auth_user(cur, "authduplicate@example.com")
    seed_auth_user(cur, "AUTHDUPLICATE@example.com")
    checks.true(
        "duplicate normalized auth emails abort UUID backfill",
        expect_error(cur, read_sql(MIGRATIONS / "029_social_identity_bridge.sql")),
    )


def main() -> int:
    checks = Checks()
    with FreshPostgres() as server:
        with psycopg.connect(server.uri, autocommit=True) as connection, connection.cursor() as cur:
            reset_pre_029(cur)
            users = test_identity_migration(cur, checks)
            test_relationship_constraints(cur, checks, users)
            test_codes_and_transitions(cur, checks, users)
            test_dual_rate_limits(cur, checks, users)
            test_caps_expiry_and_mutations(cur, checks, users)
            test_profile_and_dashboard(cur, checks, users)
            test_blocked_accounts_and_pending_consent(cur, checks, users)
        run_pair_races(server.uri, checks, users)
        run_accept_block_races(server.uri, checks, users)
        run_remove_block_race(server.uri, checks, users)
        with psycopg.connect(server.uri, autocommit=True) as connection, connection.cursor() as cur:
            test_account_lifecycle(cur, checks, users)
            test_migration_rejections(cur, checks)
    checks.summary()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"\nBACKEND TEST FAILURE: {type(error).__name__}: {error}", file=sys.stderr)
        raise
