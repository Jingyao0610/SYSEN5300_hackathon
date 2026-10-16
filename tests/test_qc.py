"""Hand-answer and degenerate checks for the six-argument statistical interface."""

from copy import deepcopy
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "qc"
sys.path[:0] = [str(ROOT), str(FIXTURES)]

from app.qc import analyze_response
from qc_cases import analysis_request, baseline_records, day_records, k1_request, record


def run(rows, **settings):
    return analyze_response(**analysis_request(rows, **settings))


def test_complete_hand_worked_interface_example():
    request = json.loads((FIXTURES / "small_request.json").read_text(encoding="utf-8"))
    expected = json.loads((FIXTURES / "small_expected.json").read_text(encoding="utf-8"))
    assert analyze_response(**request) == expected


def test_k0_target_equality_one_second_late_and_zero_duration():
    rows = [record("equal", minutes=10), record("late", minutes=10 + 1/60), record("zero", minutes=0)]
    result = run(rows)
    point = result["daily_points"][0]
    assert (point["n"], point["late"], point["rate"]) == (3, 1, 1/3)
    assert [row["incident_id"] for row in result["late_incidents"]] == ["late"]
    assert result["late_incidents"][0]["response_minutes"] == pytest.approx(10 + 1/60)


@pytest.mark.parametrize("n,late,status,lower,upper", [
    (100, 0, "low", .01, .19), (100, 1, "no_signal", .01, .19),
    (100, 19, "no_signal", .01, .19), (100, 20, "high", .01, .19),
    (400, 21, "low", .055, .145), (400, 22, "no_signal", .055, .145),
    (400, 58, "no_signal", .055, .145), (400, 59, "high", .055, .145),
])
def test_k1_k3_hand_limits_and_strict_boundary_equality(n, late, status, lower, upper):
    result = analyze_response(**k1_request(n, late))
    baseline = result["zone_baselines"][0]
    point = result["daily_points"][0]
    assert (baseline["n"], baseline["late"], baseline["nonempty_days"]) == (2000, 200, 20)
    assert baseline["p_bar"] == .1
    assert baseline["status"] == "ready"
    assert point["rate"] == late/n
    assert point["lower"] == pytest.approx(lower, abs=1e-12, rel=0)
    assert point["upper"] == pytest.approx(upper, abs=1e-12, rel=0)
    assert point["expected_late"] == n/10
    assert point["expected_on_time"] == n*9/10
    assert point["status"] == status
    assert point["reasons"] == []
    assert result["signals"] == ([point] if status in {"high", "low"} else [])


def test_k2_weighted_baseline_and_frozen_limits_after_monitoring_addition():
    rows = baseline_records([(100, 6)]*10 + [(300, 34)]*10)
    rows += day_records("2026-09-21", 100, 20)
    first = run(rows)
    second = run(rows + day_records("2026-09-22", 100, 99))
    baseline = first["zone_baselines"][0]
    assert (baseline["n"], baseline["late"], baseline["p_bar"]) == (4000, 400, .1)
    unweighted = sum(day["rate"] for day in baseline["daily"])/20
    assert unweighted == pytest.approx(.08666666666666667)
    assert baseline == second["zone_baselines"][0]
    assert first["daily_points"][0] == second["daily_points"][0]
    assert second["daily_points"][0]["upper"] == second["daily_points"][1]["upper"]


def test_k4_weekday_uses_pooled_counts_and_has_seven_slots():
    rows = day_records("2026-09-01", 100, 6) + day_records("2026-09-08", 300, 34)
    baseline = run(rows)["zone_baselines"][0]
    assert len(baseline["weekday"]) == 7
    tuesday = baseline["weekday"][1]
    assert tuesday == {"weekday": 1, "label": "Tuesday", "nonempty_days": 2, "n": 400, "late": 40, "rate": .1}
    for slot in baseline["weekday"]:
        if slot["weekday"] != 1:
            assert (slot["n"], slot["late"], slot["rate"], slot["nonempty_days"]) == (0, 0, None, 0)


def test_zones_and_priorities_keep_separate_baselines_and_global_coverage():
    rows = baseline_records() + baseline_records([(100, 50)]*20, zone="B")
    rows += baseline_records([(100, 90)]*20, priority="P2")
    rows += day_records("2026-09-21", 100, 20) + day_records("2026-09-21", 100, 50, zone="B")
    result = run(rows, reviewed_zones=["B", "A"])
    assert [(b["zone"], b["p_bar"]) for b in result["zone_baselines"]] == [("A", .1), ("B", .5)]
    assert [p["status"] for p in result["daily_points"]] == ["high", "no_signal"]
    assert result["quality"]["overall"]["usable_rows"] == 6200
    assert result["quality"]["selected_priority"]["usable_rows"] == 4200
    assert all(item["priority"] == "P1" for item in result["late_incidents"])


def test_d1_empty_import_returns_no_performance_estimate():
    result = run([], selected_priority="unknown")
    assert result["quality"]["reasons"] == ["empty_input"]
    for scope in ("overall", "selected_priority"):
        assert result["quality"][scope] == {"total_rows": 0, "usable_rows": 0, "excluded_rows": 0, "usable_fraction": None}
    for key in ("zone_baselines", "daily_points", "signals", "late_incidents"):
        assert result[key] == []


def test_d1_one_record_new_zone_has_no_baseline_but_observed_rate():
    result = run([record("new", zone="NEW", minutes=12)], reviewed_zones=[])
    baseline = result["zone_baselines"][0]
    point = result["daily_points"][0]
    assert baseline["p_bar"] is None and baseline["daily"] == []
    assert baseline["nonempty_days"] == 0
    assert point["rate"] == 1
    assert point["lower"] is None and point["upper"] is None
    assert point["status"] == "insufficient_data"
    assert point["reasons"] == ["no_baseline", "baseline_unreviewed"]
    assert result["signals"] == []


@pytest.mark.parametrize("late,p_bar", [(0, 0), (100, 1)])
def test_d1_constant_baseline_has_no_formal_verdict(late, p_bar):
    result = run(baseline_records([(100, late)]*20) + day_records("2026-09-21", 100, 50))
    point = result["daily_points"][0]
    assert point["p_bar"] == p_bar
    assert point["rate"] == .5
    assert point["lower"] is None and point["upper"] is None
    assert "baseline_rate_degenerate" in point["reasons"]
    assert point["status"] == "insufficient_data" and result["signals"] == []


def test_d1_nineteen_baseline_days_keep_estimates_but_no_verdict():
    result = run(baseline_records([(100, 10)]*19) + day_records("2026-09-21", 100, 20))
    baseline, point = result["zone_baselines"][0], result["daily_points"][0]
    assert baseline["nonempty_days"] == 19
    assert point["reasons"] == ["baseline_fewer_than_20_days"]
    assert point["upper"] == pytest.approx(.19)
    assert point["status"] == "insufficient_data"


@pytest.mark.parametrize("baseline_late,n,late,status,expected,reason", [
    (10, 49, 5, "insufficient_data", 4.9, "expected_late_below_5"),
    (10, 50, 5, "no_signal", 5, None),
    (90, 49, 44, "insufficient_data", 4.9, "expected_on_time_below_5"),
    (90, 50, 45, "no_signal", 5, None),
])
def test_d1_expected_count_boundary_is_symmetric_and_not_float_cancellation(
        baseline_late, n, late, status, expected, reason):
    result = run(baseline_records([(100, baseline_late)]*20) + day_records("2026-09-21", n, late))
    point = result["daily_points"][0]
    assert point["status"] == status
    field = "expected_late" if baseline_late == 10 else "expected_on_time"
    assert point[field] == expected
    assert point["reasons"] == ([reason] if reason else [])
    assert (point["upper"] is None) == (n == 49)


@pytest.mark.parametrize("changes,reason", [
    ({"incident_id": " "}, "missing_incident_id"), ({"incident_id": 7}, "invalid_incident_id"),
    ({"zone": None}, "missing_zone"), ({"zone": []}, "invalid_zone"),
    ({"priority": ""}, "missing_priority"), ({"priority": 1}, "invalid_priority"),
    ({"dispatched_at": None}, "missing_dispatched_at"), ({"dispatched_at": "bad"}, "invalid_dispatched_at"),
    ({"dispatched_at": "2026-09-21"}, "invalid_dispatched_at"),
    ({"dispatched_at": "2026-09-21T09:00:00"}, "naive_dispatched_at"),
    ({"on_scene_at": None}, "missing_on_scene_at"), ({"on_scene_at": 123}, "invalid_on_scene_at"),
    ({"on_scene_at": "2026-09-21T09:08:00"}, "naive_on_scene_at"),
    ({"on_scene_at": "2026-09-21T08:59:59-04:00"}, "reversed_timestamps"),
    ({"on_scene_at": "2026-10-02T08:00:00-04:00"}, "future_on_scene_at"),
])
def test_d2_row_errors_exclude_once_with_specific_reason(changes, reason):
    bad = record("bad")
    bad.update(changes)
    result = run([record("good"), bad])
    assert result["excluded_records"][0]["row_number"] == 2
    assert result["excluded_records"][0]["reasons"] == [reason]
    assert result["quality"]["overall"] == {"total_rows": 2, "usable_rows": 1, "excluded_rows": 1, "usable_fraction": .5}


def test_d2_missing_one_row_key_is_exclusion_not_missing_column():
    bad = record("missing")
    del bad["on_scene_at"]
    result = run([record("good"), bad])
    assert result["excluded_records"][0]["reasons"] == ["missing_on_scene_at"]


def test_d2_every_duplicate_copy_is_excluded_globally_before_priority_filter():
    rows = [record("same"), record(" same ", priority="P2", on_scene_at=None), record("good")]
    result = run(rows)
    assert [r["row_number"] for r in result["excluded_records"]] == [1, 2]
    assert result["excluded_records"][0]["reasons"] == ["duplicate_incident_id"]
    assert result["excluded_records"][1]["reasons"] == ["missing_on_scene_at", "duplicate_incident_id"]
    assert result["quality"]["overall"]["usable_rows"] == 1
    assert result["quality"]["overall"]["excluded_rows"] == 2
    assert result["quality"]["selected_priority"]["total_rows"] == 2
    assert result["quality"]["selected_priority"]["excluded_rows"] == 1


def test_d2_multiple_temporal_errors_have_stable_order_and_one_exclusion():
    bad = record("bad", dispatched_at="2026-10-03T10:00:00-04:00", on_scene_at="2026-10-02T10:00:00-04:00")
    result = run([record("good"), bad])
    assert result["excluded_records"][0]["reasons"] == ["reversed_timestamps", "future_dispatched_at", "future_on_scene_at"]
    assert len(result["daily_points"]) == 1


def test_d2_known_but_all_excluded_selected_priority_returns_empty_analysis():
    result = run([record("other", priority="P2"), record("bad", on_scene_at=None), record("unassigned", priority=None)])
    assert result["quality"]["reasons"] == ["no_usable_selected_records"]
    assert result["quality"]["unassigned_priority_rows"] == 1
    assert result["quality"]["selected_priority"] == {"total_rows": 1, "usable_rows": 0, "excluded_rows": 1, "usable_fraction": 0}
    assert result["zone_baselines"] == result["daily_points"] == result["signals"] == result["late_incidents"] == []


def test_d2_entirely_invalid_import_keeps_explanations_even_with_unknown_selection():
    result = run([record("bad", on_scene_at=None)], selected_priority="unknown")
    assert result["quality"]["reasons"] == ["no_usable_imported_records"]
    assert result["quality"]["overall"]["usable_fraction"] == 0
    assert result["quality"]["selected_priority"]["usable_fraction"] is None
    assert len(result["excluded_records"]) == 1
    assert result["daily_points"] == []


def test_sparse_days_preserve_observed_invalid_dates_but_never_create_future_dates():
    rows = baseline_records() + day_records("2026-09-21", 100, 10)
    rows += [record("invalid-day", dispatched_at="2026-09-23T09:00:00-04:00", on_scene_at=None)]
    rows += [record("future", zone="FUTURE", dispatched_at="2026-10-02T09:00:00-04:00")]
    result = run(rows)
    assert [p["date"] for p in result["daily_points"]] == ["2026-09-21", "2026-09-23"]
    assert [b["zone"] for b in result["zone_baselines"]] == ["A"]
    point = result["daily_points"][1]
    assert (point["n"], point["late"], point["rate"]) == (0, 0, None)
    assert point["lower"] is None and point["expected_late"] is None
    assert point["reasons"] == ["no_usable_observations"]


@pytest.mark.parametrize("reviewed,n,late,status,reasons", [
    (["A"], 100, 20, "provisional_current_day", ["current_day_provisional"]),
    ([], 100, 20, "provisional_current_day", ["baseline_unreviewed", "current_day_provisional"]),
    ([], 49, 5, "insufficient_data", ["expected_late_below_5", "baseline_unreviewed", "current_day_provisional"]),
])
def test_d3_current_day_suppresses_signal_and_retains_all_reasons(reviewed, n, late, status, reasons):
    result = run(baseline_records() + day_records("2026-10-16", n, late),
                 reviewed_zones=reviewed, as_of="2026-10-16T12:00:00-04:00")
    point = result["daily_points"][0]
    assert point["rate"] == late/n
    assert (point["upper"] is None) == (n == 49)
    assert point["status"] == status and point["reasons"] == reasons
    assert point["is_closed"] is False
    assert result["signals"] == []


def test_unreviewed_closed_day_retains_limits_but_no_signal():
    result = analyze_response(**k1_request(reviewed_zones=[]))
    point = result["daily_points"][0]
    assert point["status"] == "unreviewed_baseline"
    assert point["reasons"] == ["baseline_unreviewed"]
    assert point["upper"] == pytest.approx(.19)
    assert result["signals"] == []


def test_d3_cross_midnight_and_exact_cutoff_use_dispatch_local_date():
    rows = [record("cross", dispatched_at="2026-10-15T23:55:00-04:00", minutes=10),
            record("boundary", dispatched_at="2026-10-16T00:00:00-04:00", minutes=12)]
    result = run(rows, baseline_end="2026-10-16T00:00:00-04:00", as_of="2026-10-16T12:00:00-04:00")
    assert result["zone_baselines"][0]["daily"] == [{"date": "2026-10-15", "n": 1, "late": 0, "rate": 0}]
    assert result["daily_points"][0]["date"] == "2026-10-16"
    assert result["late_incidents"][0]["phase"] == "monitoring"


@pytest.mark.parametrize("dispatch,arrival,expected,date", [
    ("2026-03-08T01:55:00-05:00", "2026-03-08T03:05:00-04:00", 10, "2026-03-08"),
    ("2026-11-01T01:55:00-04:00", "2026-11-01T01:05:00-05:00", 10, "2026-11-01"),
    ("2026-09-22T03:55:00Z", "2026-09-22T04:07:00Z", 12, "2026-09-21"),
])
def test_d3_elapsed_time_uses_utc_across_dst_and_dates_use_new_york(dispatch, arrival, expected, date):
    result = run([record("offset", dispatched_at=dispatch, on_scene_at=arrival)], target_minutes=9,
                 baseline_end="2026-01-01T00:00:00-05:00", as_of="2026-12-01T00:00:00-05:00")
    incident = result["late_incidents"][0]
    assert incident["response_minutes"] == expected
    assert incident["date"] == result["daily_points"][0]["date"] == date


def test_as_of_equality_is_valid_and_core_does_not_read_current_clock():
    rows = [record("equal", dispatched_at="2099-09-21T09:00:00-04:00", minutes=12)]
    result = run(rows, baseline_end="2099-09-21T00:00:00-04:00", as_of=rows[0]["on_scene_at"])
    assert result["quality"]["overall"]["usable_rows"] == 1
    assert result["meta"]["current_local_date"] == "2099-09-21"


@pytest.mark.parametrize("field,value", [
    ("target_minutes", 0), ("target_minutes", -1), ("target_minutes", True),
    ("target_minutes", "10"), ("target_minutes", float("nan")), ("target_minutes", float("inf")),
    ("selected_priority", " "), ("selected_priority", None),
    ("reviewed_zones", "A"), ("reviewed_zones", [None]), ("reviewed_zones", [""]),
    ("baseline_end", "2026-09-21"), ("baseline_end", "2026-09-21T00:00:00"),
    ("baseline_end", "2026-09-21T01:00:00-04:00"),
    ("baseline_end", "2026-10-02T00:00:00-04:00"),
    ("as_of", "bad"), ("as_of", "2026-10-01T00:00:00"),
    ("records", {}), ("records", [None]), ("records", [{"incident_id": "only"}]),
])
def test_invalid_overall_parameters_raise_valueerror(field, value):
    request = analysis_request([record()])
    request[field] = value
    with pytest.raises(ValueError, match=field):
        analyze_response(**request)


def test_unknown_priority_with_other_usable_rows_is_parameter_error():
    with pytest.raises(ValueError, match="selected_priority"):
        run([record(priority="P2")])


def test_normalization_determinism_no_input_mutation_and_json_safety():
    rows = [record(" b ", zone=" B ", priority=" P1 ", minutes=12),
            record("a", zone="A", minutes=12)]
    request = analysis_request(rows, selected_priority=" P1 ", reviewed_zones=["B", " A ", "A"],
                               baseline_end="2026-09-21T04:00:00Z")
    before = deepcopy(request)
    first = analyze_response(**request)
    assert request == before
    assert analyze_response(**request) == first
    assert first["meta"]["reviewed_zones"] == ["A", "B"]
    assert first["meta"]["baseline_end"] == "2026-09-21T00:00:00-04:00"
    assert [p["zone"] for p in first["daily_points"]] == ["A", "B"]
    assert [r["incident_id"] for r in first["late_incidents"]] == ["a", "b"]
    json.dumps(first, allow_nan=False)
    reversed_result = run(list(reversed(rows)), reviewed_zones=["A", "B"])
    assert first["daily_points"] == reversed_result["daily_points"]


@pytest.mark.parametrize("field", ["dispatched_at", "on_scene_at"])
@pytest.mark.parametrize("offset", ["+00:60", "-00:60", "+00:00:60", "-00:00:60",
                                    "+0060", "-0060", "+000060", "+24:00"])
def test_d2_invalid_offset_components_are_excluded_not_normalized(field, offset):
    bad = record("invalid-offset")
    bad[field] = "2026-09-21T09:00:00" + offset
    result = run([record("good"), bad])
    assert result["quality"]["overall"]["usable_rows"] == 1
    assert result["excluded_records"][0]["reasons"] == ["invalid_" + field]


@pytest.mark.parametrize("field,value", [
    ("as_of", "2026-10-01T00:00:00+00:60"),
    ("as_of", "2026-10-01T00:00:00+00:00:60"),
    ("baseline_end", "2026-09-21T05:00:00+00:60"),
    ("baseline_end", "2026-09-21T04:01:00+00:00:60"),
])
def test_invalid_offset_settings_raise_valueerror(field, value):
    with pytest.raises(ValueError, match=field):
        run([record()], **{field: value})


@pytest.mark.parametrize("dispatch", [
    "2026-09-21T09:00:00Z", "2026-09-21T09:00:00+00", "2026-09-21T09:00:00+0000",
    "2026-09-21T09:00:00+00:00", "2026-09-21T09:00:00+05:30", "20260921T090000+0530",
    "2026-09-21T09:00:00-04:00", "2026-09-21T09:00:00-0400",
    "2026-09-21T09:00:00+05:30:15", "20260921T090000+053015",
    "2026-09-21T09:00:00+05:30:15.5", "20260921T090000+053015.5",
])
def test_valid_offset_forms_keep_elapsed_time(dispatch):
    result = run([record("valid-offset", dispatched_at=dispatch, minutes=12)])
    assert result["quality"]["overall"]["usable_rows"] == 1
    assert result["excluded_records"] == []
    assert result["late_incidents"][0]["response_minutes"] == 12


@pytest.mark.parametrize("field", ["dispatched_at", "on_scene_at"])
@pytest.mark.parametrize("clock", ["24:00:00", "09:60:00", "09:00:60"])
def test_d2_invalid_base_clock_components_are_excluded(field, clock):
    bad = record("invalid-clock")
    bad[field] = "2026-09-21T" + clock + "-04:00"
    result = run([record("good"), bad])
    assert result["excluded_records"][0]["reasons"] == ["invalid_" + field]
