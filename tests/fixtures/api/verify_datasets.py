"""Read-only published CSV acceptance against a real HTTP API and verified core.

Run from the repo root. Without --endpoint this owns a temporary local Uvicorn
process; with --endpoint it checks an already running /analyze endpoint. No URL
or source records are written to output. --report must be inside this folder.
"""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from app.qc import analyze_response


def cases():
    settings = json.loads((ROOT / 'data/shifeng_synthetic/settings.json').read_text())
    for collection in ('jingyao_synthetic', 'shifeng_synthetic'):
        for filename in ('stable.csv', 'zone_shift.csv', 'edge_cases.csv'):
            path = ROOT / 'data' / collection / filename
            with path.open(newline='', encoding='utf-8') as stream:
                reader = csv.DictReader(stream)
                assert reader.fieldnames == ['incident_id', 'zone', 'priority', 'dispatched_at', 'on_scene_at']
                rows = list(reader)
            if collection == 'shifeng_synthetic':
                request_settings = dict(settings['datasets'][filename]['settings'])
            else:
                request_settings = {
                    'target_minutes': 10,
                    'baseline_end': '2026-09-21T00:00:00-04:00',
                    'as_of': ('2026-10-01T12:00:00-04:00' if filename == 'edge_cases.csv'
                              else '2026-10-01T00:00:00-04:00'),
                    'reviewed_zones': (['EDGE', 'SHORT', 'ZERO', 'ONE', 'NEW', 'BOUNDARY']
                                       if filename == 'edge_cases.csv' else ['A', 'B']),
                }
            for priority in ('P1', 'P2'):
                yield path, {'records': rows, **request_settings, 'selected_priority': priority}
    path = ROOT / 'data/real_nyc_brooklyn_queens_sev2.csv'
    with path.open(newline='', encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    yield path, {'records': rows, 'target_minutes': 10, 'selected_priority': '2',
                 'baseline_end': '2026-08-21T00:00:00-04:00',
                 'as_of': '2026-10-02T00:00:00-04:00',
                 'reviewed_zones': ['BROOKLYN', 'QUEENS']}


def post(endpoint, payload):
    request = urllib.request.Request(endpoint, data=json.dumps(payload, allow_nan=False).encode(),
                                     headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as response:
        return response.code, json.load(response)


def accounting(result):
    assert result['meta']['schema_version'] == '1.0'
    assert result['meta']['timezone'] == 'America/New_York'
    assert result['meta']['is_mock'] is False
    for scope in ('overall', 'selected_priority'):
        counts = result['quality'][scope]
        assert counts['total_rows'] == counts['usable_rows'] + counts['excluded_rows']
    assert len(result['excluded_records']) == result['quality']['overall']['excluded_rows']
    assert result['signals'] == [point for point in result['daily_points'] if point['status'] in ('high', 'low')]


def verify(endpoint):
    evidence = []
    successful = rejected = calls = 0
    for path, request in cases():
        name = str(path.relative_to(ROOT))
        settings = {key: value for key, value in request.items() if key != 'records'}
        item = {'file': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'settings': settings, 'rows': len(request['records'])}
        try:
            expected = analyze_response(**request)
        except ValueError as exc:
            status, actual = post(endpoint, request)
            calls += 1
            assert status == 422, (name, status)
            assert actual['error']['code'] == 'invalid_request'
            assert actual['error']['message'] == str(exc)
            assert actual['error']['fields'] == ['selected_priority']
            item.update(result='PASS expected 422', error=actual['error'])
            rejected += 1
            print(f"PASS {name} priority={request['selected_priority']}: expected HTTP 422 ({str(exc)})")
        else:
            unreviewed = {**request, 'reviewed_zones': []}
            status, initial = post(endpoint, unreviewed)
            calls += 1
            assert status == 200 and initial == analyze_response(**unreviewed), name
            accounting(initial)
            assert initial['signals'] == [], name
            # Exactly what the UI must do: preserve the returned observation
            # cutoff while explicitly confirming baselines for these settings.
            reviewed = {**request, 'as_of': initial['meta']['as_of']}
            status, actual = post(endpoint, reviewed)
            calls += 1
            assert status == 200 and actual == expected == analyze_response(**reviewed), name
            accounting(actual)
            replay = {**reviewed, 'as_of': actual['meta']['as_of']}
            status, repeated = post(endpoint, replay)
            calls += 1
            assert status == 200 and repeated == actual, name
            item.update(result='PASS exact full response parity; unreviewed/reviewed/replay',
                        quality=actual['quality'],
                        baselines=[{key: baseline[key] for key in ('zone', 'n', 'late', 'p_bar', 'status')}
                                   for baseline in actual['zone_baselines']],
                        point_statuses=dict(Counter(point['status'] for point in actual['daily_points'])),
                        unreviewed_statuses=dict(Counter(point['status'] for point in initial['daily_points'])),
                        signals=[{key: point[key] for key in ('zone', 'date', 'n', 'late', 'rate', 'lower', 'upper', 'status')}
                                 for point in actual['signals']],
                        resolved_as_of=actual['meta']['as_of'])
            successful += 1
            counts = actual['quality']['overall']
            print(f"PASS {name} priority={request['selected_priority']}: "
                  f"{counts['total_rows']}/{counts['usable_rows']}/{counts['excluded_rows']} total/usable/excluded; "
                  f"{len(actual['signals'])} signals; HTTP/core exact parity, unreviewed and returned-as_of replay")
        evidence.append(item)
    print(f'PASS {successful} successful combinations + {rejected} expected rejection; {calls} live HTTP calls; 7 CSVs unchanged')
    return evidence, calls


def local_server(port):
    # Refuse a busy port before spawning, avoiding accidental checks of another service.
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', port))
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.app:app', '--host', '127.0.0.1',
                                '--port', str(port), '--no-access-log'], cwd=ROOT,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    endpoint = f'http://127.0.0.1:{port}/analyze'
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError('Owned API process exited before readiness.')
            try:
                with urllib.request.urlopen(endpoint.replace('/analyze', '/health'), timeout=1) as response:
                    assert json.load(response)['analysis_mode'] == 'real'
                    return process, endpoint
            except urllib.error.URLError:
                time.sleep(.1)
        raise RuntimeError('Owned API process did not become ready within 10 seconds.')
    except BaseException:
        process.terminate()
        process.wait(timeout=10)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--endpoint', help='Complete analysis endpoint; never included in the report.')
    parser.add_argument('--port', type=int, default=18002)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = args.report.resolve() if args.report else None
    if report:
        assert report.is_relative_to(Path(__file__).resolve().parent), 'Report must stay inside tests/fixtures/api/'
    before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (ROOT / 'data').rglob('*') if path.is_file()}
    process = None
    try:
        endpoint = args.endpoint
        if endpoint is None:
            process, endpoint = local_server(args.port)
        evidence, calls = verify(endpoint)
        after = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in before}
        assert before == after, 'Source data changed during acceptance.'
        if report:
            revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
            summary = {
                'source_revision': revision, 'checked_at_utc': datetime.now(timezone.utc).isoformat(),
                'method': 'Exact complete JSON equality against app.qc; live HTTP, real mode',
                'live_http_calls': calls, 'datasets_unchanged': True, 'combinations': evidence,
                'limitations': [
                    'No browser or deployment acceptance is claimed by this runner.',
                    'Reviewed zones are explicit software-test confirmations, not evidence of operational human review.',
                    'Real NYC source is precleaned: app exclusions do not describe upstream exclusions.',
                    'NYC first-assignment-to-first-arrival incident metric differs from synthetic unit-response records.',
                    'Jingyao edge contains no P2; its P2 request is expected to fail unknown-category validation.',
                ],
            }
            report.write_text(json.dumps(summary, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Connector URLs/credentials must not appear in transport exception text.
        print(f'FAIL dataset acceptance: {type(exc).__name__}; no endpoint details logged.', file=sys.stderr)
        raise SystemExit(1)
