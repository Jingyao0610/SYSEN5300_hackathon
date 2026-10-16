// Cross-language acceptance: the actual JS generator feeds the unchanged
// Python core and FastAPI endpoint. No browser or remote service is used here.
// Requires the normal backend dependencies. Set PYTHON_BIN if needed.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createSimulation, advanceSimulation, SIMULATION_SETTINGS } from '../src/simulation.js'

const initial = createSimulation(5300)
let normal = initial
let shifted = initial
let mixed = initial
const cases = [{ name: 'baseline', state: initial, reviewed: [] }]
for (let i = 1; i <= 40; i++) {
  normal = advanceSimulation(normal, 'normal')
  shifted = advanceSimulation(shifted, 'zone_shift')
  mixed = advanceSimulation(mixed, i <= 8 ? 'normal' : 'zone_shift')
  if ([1, 3, 4, 5, 8, 40].includes(i)) {
    cases.push({ name: `shift-${i}`, state: shifted, reviewed: ['A', 'B'] })
  }
  if (i === 4) cases.push({ name: 'unreviewed-4', state: shifted, reviewed: [] })
}
cases.push({ name: 'normal-40', state: normal, reviewed: ['A', 'B'] })
cases.push({ name: 'mixed-40', state: mixed, reviewed: ['A', 'B'] })

const program = String.raw`
import json, math, sys
from datetime import datetime, timezone
from collections import defaultdict
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient
from app.app import app, server_clock
from app.qc import analyze_response

payload = json.load(sys.stdin)
ny = ZoneInfo('America/New_York')
baselines = None
outputs = {}
checks = 0
app.dependency_overrides[server_clock] = lambda: datetime(2026, 10, 2, tzinfo=timezone.utc)
try:
    with TestClient(app) as client:
        for case in payload['cases']:
            state = case['state']
            request = dict(payload['settings'], records=state['records'],
                           as_of=state['asOf'], reviewed_zones=case['reviewed'])
            expected = analyze_response(**request)
            reply = client.post('/analyze', json=request)
            assert reply.status_code == 200, (case['name'], reply.text)
            actual = reply.json()
            assert actual == expected, case['name']
            assert actual['meta']['is_mock'] is False
            total = 4000 + state['step'] * 50
            assert actual['quality']['overall'] == {
                'total_rows': total, 'usable_rows': total, 'excluded_rows': 0, 'usable_fraction': 1.0}
            assert actual['quality']['selected_priority'] == actual['quality']['overall']

            # Independently count raw timestamps; do not use core helpers.
            observed = datetime.fromisoformat(state['asOf'])
            cutoff = datetime.fromisoformat(payload['settings']['baseline_end'])
            base_raw = defaultdict(lambda: [0, 0, set()])
            daily_raw = defaultdict(lambda: [0, 0])
            for record in state['records']:
                dispatched = datetime.fromisoformat(record['dispatched_at'])
                arrived = datetime.fromisoformat(record['on_scene_at'])
                assert dispatched < arrived <= observed
                late = int((arrived - dispatched).total_seconds() > 600)
                day = dispatched.astimezone(ny).date().isoformat()
                if dispatched < cutoff:
                    group = base_raw[record['zone']]
                    group[0] += 1
                    group[1] += late
                    group[2].add(day)
                else:
                    group = daily_raw[(record['zone'], day)]
                    group[0] += 1
                    group[1] += late
            current_baselines = {}
            for base in actual['zone_baselines']:
                n, late, days = base_raw[base['zone']]
                assert n == 2000 and len(days) == 20
                assert (base['n'], base['late'], base['nonempty_days']) == (n, late, 20)
                assert math.isclose(base['p_bar'], late / n, abs_tol=1e-12)
                current_baselines[base['zone']] = (n, late, base['p_bar'])
            if baselines is None:
                baselines = current_baselines
            assert current_baselines == baselines, 'Monitoring changed the baseline'
            today = observed.astimezone(ny).date().isoformat()
            for point in actual['daily_points']:
                n, late = daily_raw[(point['zone'], point['date'])]
                assert (point['n'], point['late']) == (n, late)
                assert math.isclose(point['rate'], late / n, abs_tol=1e-12)
                p_bar = baselines[point['zone']][2]
                if point['upper'] is not None:
                    delta = 3 * math.sqrt(p_bar * (1 - p_bar) / n)
                    assert math.isclose(point['lower'], max(0, p_bar - delta), abs_tol=1e-12)
                    assert math.isclose(point['upper'], min(1, p_bar + delta), abs_tol=1e-12)
                if point['date'] == today:
                    assert point['status'] not in ('high', 'low', 'no_signal')
                    assert 'current_day_provisional' in point['reasons']
            assert all(signal['date'] < today for signal in actual['signals'])
            if not case['reviewed']:
                assert actual['signals'] == []
            outputs[case['name']] = actual
            print(f"PASS {case['name']}: {total} usable / 0 excluded; core == HTTP; {len(actual['signals'])} formal signals")
            checks += 1
        # The first complete shifted day can be judged; partial day cannot.
        assert outputs['shift-3']['signals'] == []
        assert any(p['status'] == 'provisional_current_day' for p in outputs['shift-3']['daily_points'])
        assert any(s['zone'] == 'A' for s in outputs['shift-4']['signals'])
        assert len(outputs['shift-40']['daily_points']) == 20
        # B uses the same random draws under either scenario.
        def zone_b(result):
            return [p for p in result['daily_points'] if p['zone'] == 'B']
        assert zone_b(outputs['shift-40']) == zone_b(outputs['normal-40'])
        assert zone_b(outputs['mixed-40']) == zone_b(outputs['normal-40'])
        # Switching after two full days preserves those closed observations.
        def first_two(result):
            return [p for p in result['daily_points'] if p['date'] <= '2026-09-22']
        assert first_two(outputs['mixed-40']) == first_two(outputs['normal-40'])
        print(f"{checks}/{checks} generated-stream core/API cases PASS; frozen baselines, day closure and mixed-scenario history PASS")
        print('Seed 5300 baseline:', json.dumps(baselines))
finally:
    app.dependency_overrides.pop(server_clock, None)
`

const child = spawnSync(process.env.PYTHON_BIN || 'python3', ['-c', program], {
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  input: JSON.stringify({ settings: SIMULATION_SETTINGS, cases }),
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
})
if (child.stdout) process.stdout.write(child.stdout)
if (child.stderr) process.stderr.write(child.stderr)
if (child.error) throw child.error
process.exitCode = child.status ?? 1
