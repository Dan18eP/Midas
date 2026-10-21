"""Validate the policies actually shipped to Spark executors."""

from decimal import Decimal

import pytest

from jobs.runtime import batch_key, normalize_amount, normalize_date


@pytest.mark.parametrize("value", ["ERROR_404", "abc123", "1,23", "NaN", "Infinity", "10000000000000000"])
def test_corrupt_amounts_do_not_turn_into_financial_values(value):
    assert normalize_amount(value) is None


@pytest.mark.parametrize("value,expected", [("$1,250.50", "1250.50"), ("USD 300.00", "300.00"), ("($25.50)", "-25.50")])
def test_currency_formats_keep_their_amount_and_sign(value, expected):
    assert normalize_amount(value) == Decimal(expected)


def test_dates_and_retry_identity_follow_the_contract():
    assert normalize_date("2500-01-01") is None
    assert normalize_date("2026-10-21T07:00:00-05:00") == "2026-10-21T12:00:00Z"
    assert batch_key("scheduled/run:1") == batch_key("scheduled/run:1")
    assert batch_key("scheduled/run:1") != batch_key("scheduled/run:2")
