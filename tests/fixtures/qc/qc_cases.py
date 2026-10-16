"""Deterministic, synthetic inputs shared by core review and later API tests."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def record(incident_id="one", *, zone="A", priority="P1", minutes=8,
           dispatched_at="2026-09-21T09:00:00-04:00", **changes):
    """Make one completed response; changes can deliberately introduce row errors."""
    dispatch = datetime.fromisoformat(dispatched_at)
    row = {
        "incident_id": incident_id,
        "zone": zone,
        "priority": priority,
        "dispatched_at": dispatched_at,
        "on_scene_at": (dispatch + timedelta(minutes=minutes)).isoformat(),
    }
    row.update(changes)
    return row


def day_records(day, n, late, *, zone="A", priority="P1", tag="fixture"):
    """Create exactly n responses, first late at 12 min and others on time at 8 min."""
    assert 0 <= late <= n
    start = datetime.combine(date.fromisoformat(day), datetime.min.time()).replace(
        hour=8, tzinfo=ZoneInfo("America/New_York")
    )
    return [
        record(
            f"{tag}:{zone}:{priority}:{day}:{index}", zone=zone, priority=priority,
            dispatched_at=(start + timedelta(seconds=index)).isoformat(),
            minutes=12 if index < late else 8,
        )
        for index in range(n)
    ]


def baseline_records(daily_counts=None, *, start="2026-09-01", zone="A", priority="P1"):
    """Default K1 baseline: twenty dates, each with exactly 10 late / 100 completed."""
    if daily_counts is None:
        daily_counts = [(100, 10)] * 20
    first_day = date.fromisoformat(start)
    rows = []
    for index, (n, late) in enumerate(daily_counts):
        day = (first_day + timedelta(days=index)).isoformat()
        rows.extend(day_records(day, n, late, zone=zone, priority=priority, tag="baseline"))
    return rows


def analysis_request(records, **changes):
    """Core kwargs / POST JSON body with fixed historical time and reviewed zone A."""
    body = {
        "records": records,
        "target_minutes": 10,
        "selected_priority": "P1",
        "baseline_end": "2026-09-21T00:00:00-04:00",
        "reviewed_zones": ["A"],
        "as_of": "2026-10-01T00:00:00-04:00",
    }
    body.update(changes)
    return body


def k1_request(n=100, late=20, **changes):
    return analysis_request(
        baseline_records() + day_records("2026-09-21", n, late), **changes
    )
