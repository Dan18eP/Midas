"""Small cron schedule checks shared by the API and Airflow factory."""

import re


def is_valid_cron_schedule(value: str) -> bool:
    """Check the common numeric cron syntax used by scheduled Gold jobs."""
    limits = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))
    fields = value.split()
    if len(fields) != 5:
        return False

    for field, (minimum, maximum) in zip(fields, limits):
        for segment in field.split(","):
            base, *step_part = segment.split("/")
            if not segment or len(step_part) > 1:
                return False
            if step_part and (not step_part[0].isdigit() or int(step_part[0]) < 1):
                return False
            if base == "*":
                continue
            bounds = base.split("-")
            if len(bounds) > 2 or any(not re.fullmatch(r"\d+", item) for item in bounds):
                return False
            values = [int(item) for item in bounds]
            if any(item < minimum or item > maximum for item in values):
                return False
            if len(values) == 2 and values[0] > values[1]:
                return False
    return True
