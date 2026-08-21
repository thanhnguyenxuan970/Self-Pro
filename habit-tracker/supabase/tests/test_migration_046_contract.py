"""Regression checks for the idempotent leaderboard snapshot FK migration."""

from pathlib import Path
import re
import unittest


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "046_leaderboard_snapshot_email_cascade.sql"
)
TARGET_CONSTRAINT = "leaderboard_snapshots_user_email_fkey"


class Migration046ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8")

    def test_named_constraint_is_removed_before_it_is_recreated(self) -> None:
        name_match = re.search(
            r"(?:\w+\.)?conname\s*=\s*target_name",
            self.sql,
            flags=re.IGNORECASE,
        )
        target_drop_match = re.search(
            r"DROP\s+CONSTRAINT\s+%I'\s*,\s*target_fk\.conname",
            self.sql,
            flags=re.IGNORECASE | re.DOTALL,
        )
        legacy_drop_match = re.search(
            r"DROP\s+CONSTRAINT\s+%I'\s*,\s*existing_fk\.conname",
            self.sql,
            flags=re.IGNORECASE | re.DOTALL,
        )
        add_match = re.search(
            rf"ADD\s+CONSTRAINT\s+{TARGET_CONSTRAINT}",
            self.sql,
            flags=re.IGNORECASE,
        )

        self.assertIsNotNone(
            name_match,
            "migration must identify the already-existing named FK",
        )
        self.assertIsNotNone(
            target_drop_match,
            "migration must drop the named FK before ADD CONSTRAINT",
        )
        self.assertIsNotNone(
            legacy_drop_match,
            "migration must drop a legacy FK before ADD CONSTRAINT",
        )
        self.assertIsNotNone(add_match)
        assert target_drop_match is not None
        assert legacy_drop_match is not None
        assert add_match is not None
        self.assertLess(target_drop_match.start(), add_match.start())
        self.assertLess(legacy_drop_match.start(), add_match.start())
        self.assertRegex(self.sql, r"target_fk\.conname")
        self.assertRegex(self.sql, r"existing_fk\.conname")

    def test_reuses_correct_constraint_and_serializes_repairs(self) -> None:
        self.assertIn("pg_catalog.pg_advisory_xact_lock", self.sql)
        self.assertIn("pg_catalog.hashtextextended", self.sql)
        self.assertRegex(self.sql, r"confdeltype\s*=\s*'c'")
        self.assertRegex(self.sql, r"confupdtype\s*=\s*'c'")
        self.assertRegex(self.sql, r"RETURN\s*;")
        self.assertIn("unexpected definition", self.sql)
        self.assertIn("con.convalidated", self.sql)
        self.assertIn("NOT target_fk.convalidated", self.sql)
        self.assertRegex(self.sql, r"VALIDATE\s+CONSTRAINT")
        self.assertRegex(
            self.sql,
            r"REFERENCES\s+public\.users\s*\(\s*user_email\s*\)",
        )

    def test_catalog_reads_are_qualified(self) -> None:
        self.assertIn("FROM pg_catalog.pg_constraint", self.sql)
        self.assertIn("FROM pg_catalog.pg_attribute", self.sql)

    def test_recreated_constraint_preserves_both_cascade_actions(self) -> None:
        constraint_sql = self.sql[
            self.sql.lower().index("add constraint") :
        ]
        self.assertRegex(constraint_sql, r"ON\s+DELETE\s+CASCADE")
        self.assertRegex(constraint_sql, r"ON\s+UPDATE\s+CASCADE")


if __name__ == "__main__":
    unittest.main()
