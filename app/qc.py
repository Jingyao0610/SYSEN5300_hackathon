"""Completed-response p charts with a fixed, zone-specific historical baseline.

The single public entry point is ``analyze_response``. It accepts plain records
and explicit settings, returns JSON-compatible values, and never reads a clock.
See SPEC.md and docs/interfaces.md for assumptions, exclusions, and UI meanings.
Method: https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm
"""

from collections import Counter, defaultdict
from collections.abc import Mapping
from datetime import date, datetime, timezone
import math
import re
from zoneinfo import ZoneInfo


_NEW_YORK = ZoneInfo("America/New_York")
_UTC = timezone.utc
_COLUMNS = ("incident_id", "zone", "priority", "dispatched_at", "on_scene_at")
_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
_BOUNDARY_TOLERANCE = 1e-12


def _missing(value):
    return value is None or (isinstance(value, str) and not value.strip())


def _identifier(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def _timestamp(value):
    """Return (UTC datetime, error kind); date-only values are not datetimes."""
    if _missing(value):
        return None, "missing"
    if not isinstance(value, str):
        return None, "invalid"
    value = value.strip()
    time_start = re.search(r"[Tt ]\d{2}", value)
    if time_start is None:
        return None, "invalid"
    offset = re.search(r"[+-].*$", value[time_start.start() + 1:])
    if offset is not None:
        # fromisoformat normalizes +00:60 and +00:00:60; reject bad
        # components before parsing. Accept basic/extended offsets and fractions.
        parts = re.fullmatch(r"[+-](\d{2})(?::?(\d{2}))?(?::?(\d{2}))?(?:[.,]\d+)?",
                             offset.group())
        if parts is None:
            return None, "invalid"
        hours, minutes, seconds = (int(part or 0) for part in parts.groups())
        if hours > 23 or minutes > 59 or seconds > 59:
            return None, "invalid"
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.utcoffset() is None:
            return None, "naive"
        utc = parsed.astimezone(_UTC)
        # Every accepted instant must also be representable in the grouping zone.
        utc.astimezone(_NEW_YORK)
        return utc, None
    except (ValueError, OverflowError):
        return None, "invalid"


def _required_timestamp(value, field):
    parsed, error = _timestamp(value)
    if error:
        raise ValueError(f"{field} must be an ISO 8601 datetime with a UTC offset.")
    return parsed


def _settings(records, target_minutes, selected_priority, baseline_end, reviewed_zones, as_of):
    """Validate the envelope separately from recoverable individual row errors."""
    if not isinstance(records, list) or any(not isinstance(row, Mapping) for row in records):
        raise ValueError("records must be a list of mappings.")
    if records:
        available_columns = set().union(*(row.keys() for row in records))
        absent = [column for column in _COLUMNS if column not in available_columns]
        if absent:
            raise ValueError("records is missing required columns: " + ", ".join(absent))
    try:
        numeric_target = (not isinstance(target_minutes, bool)
                          and isinstance(target_minutes, (int, float))
                          and math.isfinite(target_minutes) and target_minutes > 0)
    except OverflowError:
        numeric_target = False
    if not numeric_target:
        raise ValueError("target_minutes must be a finite number greater than zero.")
    priority = _identifier(selected_priority)
    if priority is None:
        raise ValueError("selected_priority must be a nonempty string.")
    if (not isinstance(reviewed_zones, list)
            or any(_identifier(zone) is None for zone in reviewed_zones)):
        raise ValueError("reviewed_zones must be a list of nonempty strings.")
    reviewed = sorted({_identifier(zone) for zone in reviewed_zones})
    observation_time = _required_timestamp(as_of, "as_of")
    cutoff = _required_timestamp(baseline_end, "baseline_end")
    local_as_of = observation_time.astimezone(_NEW_YORK)
    local_cutoff = cutoff.astimezone(_NEW_YORK)
    midnight = local_as_of.replace(hour=0, minute=0, second=0, microsecond=0)
    if (any((local_cutoff.hour, local_cutoff.minute, local_cutoff.second, local_cutoff.microsecond))
            or cutoff > midnight.astimezone(_UTC)):
        raise ValueError("baseline_end must be New York midnight no later than the start of the as_of day.")
    return priority, reviewed, observation_time, cutoff


def _validated_rows(records, as_of):
    """Keep every invalid row; detect duplicates across the entire import first."""
    ids = Counter(_identifier(row.get("incident_id")) for row in records)
    rows = []
    for row_number, source in enumerate(records, start=1):
        row = {"row_number": row_number, "reasons": []}
        for field in ("incident_id", "zone", "priority"):
            value = source.get(field)
            row[field] = _identifier(value)
            if row[field] is None:
                kind = "missing" if _missing(value) else "invalid"
                row["reasons"].append(f"{kind}_{field}")
        for field in ("dispatched_at", "on_scene_at"):
            parsed, error = _timestamp(source.get(field))
            row[field] = parsed
            if error:
                row["reasons"].append(f"{error}_{field}")
        dispatch, arrival = row["dispatched_at"], row["on_scene_at"]
        if dispatch is not None and arrival is not None and arrival < dispatch:
            row["reasons"].append("reversed_timestamps")
        if dispatch is not None and dispatch > as_of:
            row["reasons"].append("future_dispatched_at")
        if arrival is not None and arrival > as_of:
            row["reasons"].append("future_on_scene_at")
        if row["incident_id"] is not None and ids[row["incident_id"]] > 1:
            row["reasons"].append("duplicate_incident_id")
        rows.append(row)
    return rows


def _coverage(rows):
    total = len(rows)
    usable = sum(not row["reasons"] for row in rows)
    return {"total_rows": total, "usable_rows": usable, "excluded_rows": total - usable,
            "usable_fraction": usable / total if total else None}


def _baseline_reasons(n, nonempty_days, p_bar):
    reasons = []
    if n == 0:
        reasons.append("no_baseline")
    else:
        if nonempty_days < 20:
            reasons.append("baseline_fewer_than_20_days")
        if p_bar in (0, 1):
            reasons.append("baseline_rate_degenerate")
    return reasons


def _baseline(zone, priority, daily_counts, reviewed):
    daily = [{"date": day, "n": n, "late": late, "rate": late / n}
             for day, (n, late) in sorted(daily_counts.items())]
    n = sum(day["n"] for day in daily)
    late = sum(day["late"] for day in daily)
    p_bar = late / n if n else None
    reasons = _baseline_reasons(n, len(daily), p_bar)
    status = "insufficient_data" if reasons else "ready"
    if not reviewed:
        reasons.append("baseline_unreviewed")
        if status == "ready":
            status = "unreviewed_baseline"
    weekday = [{"weekday": index, "label": label, "nonempty_days": 0,
                "n": 0, "late": 0, "rate": None} for index, label in enumerate(_WEEKDAYS)]
    for day in daily:
        slot = weekday[date.fromisoformat(day["date"]).weekday()]
        slot["nonempty_days"] += 1
        slot["n"] += day["n"]
        slot["late"] += day["late"]
    for slot in weekday:
        if slot["n"]:
            slot["rate"] = slot["late"] / slot["n"]
    return {"zone": zone, "priority": priority, "reviewed": reviewed, "nonempty_days": len(daily),
            "n": n, "late": late, "p_bar": p_bar, "status": status,
            "reasons": reasons, "daily": daily, "weekday": weekday}


def _daily_point(zone, priority, day, n, late, baseline, current_date):
    """Estimate limits only when expected counts permit the normal approximation."""
    p_bar = baseline["p_bar"]
    rate = late / n if n else None
    expected_late = expected_on_time = lower = upper = None
    reasons = [] if n else ["no_usable_observations"]
    reasons.extend(_baseline_reasons(baseline["n"], baseline["nonempty_days"], p_bar))
    if n and baseline["n"]:
        # Integer numerators avoid 50 * (1 - .9) becoming 4.999999999999999.
        late_numerator = n * baseline["late"]
        on_time_numerator = n * (baseline["n"] - baseline["late"])
        expected_late = late_numerator / baseline["n"]
        expected_on_time = on_time_numerator / baseline["n"]
        enough_late = late_numerator >= 5 * baseline["n"]
        enough_on_time = on_time_numerator >= 5 * baseline["n"]
        if not enough_late:
            reasons.append("expected_late_below_5")
        if not enough_on_time:
            reasons.append("expected_on_time_below_5")
        if 0 < p_bar < 1 and enough_late and enough_on_time:
            standard_error = math.sqrt(p_bar * (1 - p_bar) / n)
            lower = max(0, p_bar - 3 * standard_error)
            upper = min(1, p_bar + 3 * standard_error)
    insufficient = bool(reasons)
    is_closed = day < current_date
    if not baseline["reviewed"]:
        reasons.append("baseline_unreviewed")
    if not is_closed:
        reasons.append("current_day_provisional")
    if insufficient:
        status = "insufficient_data"
    elif not is_closed:
        status = "provisional_current_day"
    elif not baseline["reviewed"]:
        status = "unreviewed_baseline"
    elif rate - upper > _BOUNDARY_TOLERANCE:
        status = "high"
    elif lower - rate > _BOUNDARY_TOLERANCE:
        status = "low"
    else:
        status = "no_signal"
    return {"zone": zone, "priority": priority, "date": day, "n": n, "late": late,
            "rate": rate, "p_bar": p_bar, "lower": lower, "upper": upper,
            "expected_late": expected_late, "expected_on_time": expected_on_time,
            "is_closed": is_closed, "baseline_reviewed": baseline["reviewed"],
            "status": status, "reasons": reasons}


def analyze_response(records, target_minutes, selected_priority, baseline_end, reviewed_zones, as_of) -> dict:
    """Analyze one priority using daily p charts and weighted, fixed zone baselines.

    Parameters are the six JSON-compatible fields documented in docs/interfaces.md.
    Bad overall structure/settings raise ValueError; individual row errors are
    returned as exclusions. Records are never mutated. The caller supplies as_of;
    the API, not this function, checks that it is no later than server time.

    Formal verdicts require a reviewed baseline with at least 20 nonempty days,
    0 < p_bar < 1, a closed day, and both expected counts >= 5. Strict crossings
    use absolute proportion tolerance 1e-12. No additional run rules are applied.
    Missing coverage, independence and baseline comparability remain limitations.
    """
    priority, reviewed, observation_time, cutoff = _settings(
        records, target_minutes, selected_priority, baseline_end, reviewed_zones, as_of
    )
    current_date = observation_time.astimezone(_NEW_YORK).date().isoformat()
    rows = _validated_rows(records, observation_time)
    selected = [row for row in rows if row["priority"] == priority]
    overall = _coverage(rows)
    selected_coverage = _coverage(selected)
    known_priorities = {row["priority"] for row in rows if row["priority"] is not None}
    if priority not in known_priorities and overall["usable_rows"]:
        raise ValueError("selected_priority is not present in the imported records.")
    quality_reasons = []
    if not selected_coverage["usable_rows"]:
        if not rows:
            quality_reasons = ["empty_input"]
        elif not overall["usable_rows"]:
            quality_reasons = ["no_usable_imported_records"]
        else:
            quality_reasons = ["no_usable_selected_records"]
    response = {
        "meta": {"schema_version": "1.0", "timezone": "America/New_York",
                 "as_of": observation_time.isoformat(), "current_local_date": current_date,
                 "target_minutes": target_minutes, "selected_priority": priority,
                 "baseline_end": cutoff.astimezone(_NEW_YORK).isoformat(),
                 "reviewed_zones": reviewed, "is_mock": False},
        "quality": {"overall": overall, "selected_priority": selected_coverage,
                    "unassigned_priority_rows": sum(row["priority"] is None for row in rows),
                    "reasons": quality_reasons},
        "excluded_records": [
            {key: row[key] for key in ("row_number", "incident_id", "zone", "priority", "reasons")}
            for row in rows if row["reasons"]
        ],
        "zone_baselines": [], "daily_points": [], "signals": [], "late_incidents": [],
    }
    if not selected_coverage["usable_rows"]:
        return response

    baseline_counts = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    monitoring_counts = defaultdict(lambda: [0, 0])
    zones = set()
    late_rows = []
    for row in selected:
        dispatch, arrival, zone = row["dispatched_at"], row["on_scene_at"], row["zone"]
        # An excluded row may identify an observed day, but never a future day.
        if zone is None or dispatch is None or dispatch > observation_time:
            continue
        day = dispatch.astimezone(_NEW_YORK).date().isoformat()
        zones.add(zone)
        phase = "baseline" if dispatch < cutoff else "monitoring"
        if phase == "monitoring":
            monitoring_counts[(zone, day)]  # Preserve observed excluded-only dates.
        if row["reasons"]:
            continue
        minutes = (arrival - dispatch).total_seconds() / 60
        is_late = minutes > target_minutes
        counts = baseline_counts[zone][day] if phase == "baseline" else monitoring_counts[(zone, day)]
        counts[0] += 1
        counts[1] += int(is_late)
        if is_late:
            incident = {"row_number": row["row_number"], "incident_id": row["incident_id"],
                        "zone": zone, "priority": priority, "dispatched_at": dispatch.isoformat(),
                        "on_scene_at": arrival.isoformat(), "date": day,
                        "phase": phase, "response_minutes": minutes}
            sort_key = (zone, day, dispatch, row["incident_id"], row["row_number"])
            late_rows.append((sort_key, incident))
    by_zone = {}
    for zone in sorted(zones):
        baseline = _baseline(zone, priority, baseline_counts[zone], zone in reviewed)
        response["zone_baselines"].append(baseline)
        by_zone[zone] = baseline
    for (zone, day), (n, late) in sorted(monitoring_counts.items()):
        point = _daily_point(zone, priority, day, n, late, by_zone[zone], current_date)
        response["daily_points"].append(point)
        if point["status"] in ("high", "low"):
            response["signals"].append({**point, "reasons": list(point["reasons"])})
    response["late_incidents"] = [incident for _, incident in sorted(late_rows)]
    return response
