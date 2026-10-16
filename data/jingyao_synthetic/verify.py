"""Verify H-02 generation and actual core/API parity; run from repository root."""
import csv
from collections import Counter
from datetime import datetime
import json
from pathlib import Path
import sys
import tempfile
DATA_DIR = Path(__file__).resolve().parent
REPO_ROOT = next((parent for parent in DATA_DIR.parents if (parent / 'app' / 'qc.py').is_file()), None)
if REPO_ROOT is None:
    raise SystemExit('Run this bundle inside the project repository; app/qc.py is required.')
sys.path[:0] = [str(DATA_DIR), str(REPO_ROOT)]
from generate import generate, COLUMNS
from app.qc import analyze_response

def request(name, priority='P1'):
    rows=list(csv.DictReader((Path(__file__).parent/f'{name}.csv').open()))
    return dict(records=rows,target_minutes=10,selected_priority=priority,
        baseline_end='2026-09-21T00:00:00-04:00',reviewed_zones=sorted({r['zone'] for r in rows if r['zone']}),
        as_of='2026-10-01T12:00:00-04:00' if name=='edge_cases' else '2026-10-01T00:00:00-04:00')

def verify():
    folder=Path(__file__).parent
    with tempfile.TemporaryDirectory() as tmp:
        generate(Path(tmp))
        for name in ('stable','zone_shift','edge_cases'):
            assert (folder/f'{name}.csv').read_bytes()==(Path(tmp)/f'{name}.csv').read_bytes()
    print('PASS: all three CSVs reproduce byte for byte, seed 5300')
    s,t=request('stable')['records'],request('zone_shift')['records']
    baseline=lambda rows:[r for r in rows if r['dispatched_at']<'2026-09-21']
    assert baseline(s)==baseline(t) and len(baseline(s))==8000
    for rows in (s,t):
        groups=Counter((r['dispatched_at'][:10],r['zone'],r['priority']) for r in rows)
        assert len(rows)==12000 and len(groups)==120 and set(groups.values())=={100}
        assert all(8<=datetime.fromisoformat(r['dispatched_at']).hour<20 for r in rows)
        assert all(datetime.fromisoformat(r['on_scene_at'])>datetime.fromisoformat(r['dispatched_at']) for r in rows)
        assert all(list(r)==COLUMNS for r in rows)
    assert all(a==b for a,b in zip(s,t) if not(a['zone']=='A' and a['priority']=='P1' and a['dispatched_at']>='2026-09-21'))
    print('PASS: 120 groups x 100 rows; positive durations; 08:00–20:00; identical 8000-row baselines; change scope A/P1 monitoring only')
    from fastapi.testclient import TestClient
    from app.app import app
    with TestClient(app) as client:
        for name in ('stable','zone_shift','edge_cases'):
            for priority in (('P1','P2') if name!='edge_cases' else ('P1',)):
                req=request(name,priority); actual=analyze_response(**req)
                response=client.post('/analyze',json=req)
                assert response.status_code==200 and response.json()==actual
                quality=actual['quality']['overall']
                assert quality['total_rows']==quality['usable_rows']+quality['excluded_rows']
                print(f'PASS core/API parity: {name}/{priority}: '+json.dumps(quality))
                print('  baselines: '+json.dumps([{k:b[k] for k in ('zone','n','late','p_bar')} for b in actual['zone_baselines']]))
                print('  signals: '+json.dumps(actual['signals']))
                if name=='edge_cases':
                    assert (quality['total_rows'],quality['usable_rows'],quality['excluded_rows'])==(5118,5107,11)
                    points={(p['zone'],p['date']):p for p in actual['daily_points']}
                    assert points['EDGE','2026-09-21']['status']=='insufficient_data'
                    p=points['EDGE','2026-10-01']; assert p['status']=='provisional_current_day' and (p['n'],p['late'],p['rate'])==(100,20,.2)
                    late={r['incident_id']:r for r in actual['late_incidents']}
                    assert 'SYN-equal' not in late and abs(late['SYN-plus-second']['response_minutes']-(10+1/60))<1e-12
                    assert points['BOUNDARY','2026-09-30']['n']==1
                    assert points['BOUNDARY','2026-09-21']['n']==3
                    assert sum(r['incident_id']=='SYN-duplicate' for r in actual['excluded_records'])==2
                    print('PASS: D1/D2/D3; target equality; +1 second; cutoff; midnight; duplicates; provisional 20/100')
    print('PASS: H-02 checks complete. Independent playback and browser dataset acceptance remain pending.')

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--request':
        print(json.dumps(request(sys.argv[2],sys.argv[3] if len(sys.argv)>3 else 'P1')))
    else:
        verify()
