#!/usr/bin/env python3
"""Unit tests for play-analytics coverage metadata and cache revalidation."""

import datetime
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import gp_client as gp
import server


class TestAnalyticsCoverage(unittest.TestCase):
    def test_coverage_complete_range(self):
        start = datetime.date(2026, 11, 1)
        end = datetime.date(2026, 11, 5)
        seen = {
            datetime.date(2026, 11, 1),
            datetime.date(2026, 11, 2),
            datetime.date(2026, 11, 3),
            datetime.date(2026, 11, 4),
            datetime.date(2026, 11, 5),
        }
        cov = gp._coverage(seen, start, end)

        self.assertEqual(cov["data_through"], "2026-11-05")
        self.assertEqual(cov["lag_days"], 0)
        self.assertEqual(cov["days_expected"], 5)
        self.assertEqual(cov["days_present"], 5)
        self.assertEqual(cov["missing_dates"], [])

    def test_coverage_with_reporting_lag(self):
        start = datetime.date(2026, 11, 1)
        end = datetime.date(2026, 11, 7)
        seen = {
            datetime.date(2026, 11, 1),
            datetime.date(2026, 11, 2),
            datetime.date(2026, 11, 3),
            datetime.date(2026, 11, 4),
            datetime.date(2026, 11, 5),
        }
        cov = gp._coverage(seen, start, end)

        self.assertEqual(cov["data_through"], "2026-11-05")
        self.assertEqual(cov["lag_days"], 2)
        self.assertEqual(cov["days_expected"], 7)
        self.assertEqual(cov["days_present"], 5)
        self.assertIn("2026-11-06", cov["missing_dates"])
        self.assertIn("2026-11-07", cov["missing_dates"])

    def test_server_meta_contains_standard_coverage_block(self):
        raw_result = {
            "package": "com.example.app",
            "family": "installs",
            "dimension": "overview",
            "date_range": {"start": "2026-11-01", "end": "2026-11-05"},
            "files": ["installs_overview.csv"],
            "coverage": {
                "data_through": "2026-11-04",
                "lag_days": 1,
                "missing_dates": ["2026-11-05"],
                "days_expected": 5,
                "days_present": 4,
            },
        }
        meta = server._meta(raw_result)
        self.assertIn("coverage", meta)
        cov = meta["coverage"]
        self.assertEqual(cov["data_through"], "2026-11-04")
        self.assertEqual(cov["lag_days"], 1)
        self.assertEqual(cov["missing_dates"], ["2026-11-05"])


class TestCacheRevalidation(unittest.TestCase):
    def test_cache_validation_detects_stale_or_updated_blob(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            cached_file = tmp_path / "stats__installs__test.csv"
            meta_file = gp._meta_path(cached_file)

            # Write fake cached payload
            cached_content = b"Date,Package,Installs\n2026-11-01,com.app,100\n"
            cached_file.write_bytes(cached_content)

            # Write stamp matching older timestamp
            stamp = {
                "size": "50",
                "updated": "2026-11-01T00:00:00Z",
                "local_size": len(cached_content),
            }
            meta_file.write_text(json.dumps(stamp))

            # When bucket has newer timestamp "2026-11-02T00:00:00Z"
            newer_meta = {"size": "75", "updated": "2026-11-02T00:00:00Z"}

            with patch("gp_client.cache_dir", return_value=tmp_path):
                with patch("gp_client.bucket", return_value="pubsite_prod_rev_test"):
                    with patch("gp_client.object_meta", return_value=newer_meta):
                        with patch("gp_client._request", return_value=b"Updated Content"):
                            # Should detect stale cache and download new content
                            result = gp.download_object("stats/installs/test.csv", use_cache=True)
                            self.assertEqual(result, b"Updated Content")


if __name__ == "__main__":
    unittest.main()
