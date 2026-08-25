"""Regression checks for the RLS account-write predicate privilege repair."""

from pathlib import Path
import re
import unittest


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "066_grant_account_write_allowed_execute.sql"
)


class Migration066AccountWritePrivilegeContractTests(unittest.TestCase):
    def test_authenticated_can_execute_the_rls_predicate(self) -> None:
        self.assertTrue(MIGRATION.is_file(), "migration 066 must exist")
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertRegex(
            sql,
            re.compile(
                r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.account_write_allowed\s*\(\s*\)\s+TO\s+authenticated\s*;",
                flags=re.IGNORECASE,
            ),
        )

    def test_anon_and_public_do_not_receive_the_predicate_privilege(self) -> None:
        self.assertTrue(MIGRATION.is_file(), "migration 066 must exist")
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertRegex(
            sql,
            re.compile(
                r"REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.account_write_allowed\s*\(\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*;",
                flags=re.IGNORECASE,
            ),
        )


if __name__ == "__main__":
    unittest.main()
