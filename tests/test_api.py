"""Transport checks against verified synthetic fixtures; no duplicated statistics."""
from datetime import datetime, timezone
import importlib
import json
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'tests/fixtures/qc')]
from app.qc import analyze_response
from qc_cases import analysis_request, k1_request, record

api = importlib.import_module('app.app')
NOW = datetime(2026, 10, 16, 16, tzinfo=timezone.utc)

@pytest.fixture
def client():
    api.app.dependency_overrides[api.server_clock] = lambda: NOW
    with TestClient(api.app, raise_server_exceptions=False) as session:
        yield session
    api.app.dependency_overrides.clear()


def assert_error(response, status, code, field=None):
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {'error'}
    assert set(body['error']) == {'code', 'message', 'fields'}
    assert body['error']['code'] == code
    assert isinstance(body['error']['message'], str) and body['error']['message']
    if field:
        assert field in body['error']['fields']
    return body


def test_health_and_docs(client):
    assert client.get('/health').json() == {'status': 'ok', 'schema_version': '1.0', 'analysis_mode': 'real'}
    assert client.get('/docs').status_code == 200
    assert '/analyze' in client.get('/openapi.json').json()['paths']


def test_small_exact_fixture(client):
    fixture = ROOT / 'tests/fixtures/qc'
    request = json.loads((fixture / 'small_request.json').read_text())
    expected = json.loads((fixture / 'small_expected.json').read_text())
    response = client.post('/analyze', json=request)
    assert response.status_code == 200
    assert response.json() == expected == analyze_response(**request)


@pytest.mark.parametrize('n,late,status,lower,upper', [
    (100,0,'low',.01,.19),(100,1,'no_signal',.01,.19),
    (100,19,'no_signal',.01,.19),(100,20,'high',.01,.19),
    (400,21,'low',.055,.145),(400,22,'no_signal',.055,.145),
    (400,58,'no_signal',.055,.145),(400,59,'high',.055,.145),
])
def test_k1_k3_exact_core_parity(client,n,late,status,lower,upper):
    request = k1_request(n,late)
    response = client.post('/analyze',json=request)
    assert response.status_code == 200
    assert response.json() == analyze_response(**request)
    point = response.json()['daily_points'][0]
    assert point['status'] == status
    assert point['p_bar'] == .1
    assert point['lower'] == pytest.approx(lower, abs=1e-12, rel=0)
    assert point['upper'] == pytest.approx(upper, abs=1e-12, rel=0)
    assert response.json()['meta']['is_mock'] is False


@pytest.mark.parametrize('field,value', [
    ('records',None),('records',{}),('records',[None]),('records',[1]),
    ('target_minutes',True),('target_minutes','10'),('target_minutes',None),('target_minutes',0),
    ('selected_priority',1),('selected_priority',' '),('selected_priority','UNKNOWN'),
    ('baseline_end',None),('baseline_end','2026-09-21'),
    ('baseline_end','2026-09-21T01:00:00-04:00'),
    ('reviewed_zones',None),('reviewed_zones','A'),('reviewed_zones',[1]),('reviewed_zones',[' ']),
    ('as_of',None),('as_of',1),('as_of','2026-10-16'),('as_of','2026-10-16T12:00:00'),
    ('as_of','2026-10-16T12:00:00+00:60'),('as_of','2026-10-16T12:00:00+24:00'),
    ('as_of','2026-10-16T16:00:00.000001Z'),('extra',True),
])
def test_invalid_envelope(client,field,value):
    body = analysis_request([record()])
    body[field] = value
    assert_error(client.post('/analyze',json=body),422,'invalid_request',field)


@pytest.mark.parametrize('field',['records','target_minutes','selected_priority','baseline_end'])
def test_missing_required(client,field):
    body=analysis_request([])
    del body[field]
    assert_error(client.post('/analyze',json=body),422,'invalid_request',field)


@pytest.mark.parametrize('body',['{', 'null', '[]', 'true'])
def test_malformed_or_non_object_body(client,body):
    assert_error(client.post('/analyze',content=body,headers={'Content-Type':'application/json'}),422,'invalid_request')


@pytest.mark.parametrize('literal',['NaN','Infinity','-Infinity','1e999'])
def test_non_finite_setting(client,literal):
    body=json.dumps(analysis_request([])).replace('"target_minutes": 10','"target_minutes": '+literal)
    assert_error(client.post('/analyze',content=body,headers={'Content-Type':'application/json'}),422,'invalid_request','target_minutes')


def test_defaults_and_clock_sampled_once(client,monkeypatch):
    calls=[]
    def clock():
        calls.append(1)
        return NOW
    api.app.dependency_overrides[api.server_clock]=clock
    captured=[]
    real=api.analyze_response
    def spy(**kwargs):
        captured.append(kwargs)
        return real(**kwargs)
    monkeypatch.setattr(api,'analyze_response',spy)
    body=analysis_request([])
    del body['as_of'],body['reviewed_zones']
    response=client.post('/analyze',json=body)
    assert response.status_code==200
    assert calls==[1]
    assert captured[0]['as_of']==NOW.isoformat()
    assert captured[0]['reviewed_zones']==[]
    assert response.json()['quality']['reasons']==['empty_input']


def test_equal_clock_and_offset_normalization(client):
    body=analysis_request([],as_of='2026-10-16T12:00:00-04:00')
    response=client.post('/analyze',json=body)
    assert response.status_code==200
    assert response.json()['meta']['as_of']==NOW.isoformat()
    assert response.json()==client.post('/analyze',json=body).json()


def test_missing_column_vs_row_exclusion(client):
    row=record()
    del row['on_scene_at']
    assert_error(client.post('/analyze',json=analysis_request([row])),422,'invalid_request','records')
    body=analysis_request([row,record('valid')])
    response=client.post('/analyze',json=body)
    assert response.status_code==200
    assert response.json()==analyze_response(**body)
    assert response.json()['excluded_records'][0]['reasons']==['missing_on_scene_at']


@pytest.mark.parametrize('rows', [[], [record(on_scene_at=None)], [record(),record('one',priority='P2')]])
def test_empty_invalid_and_duplicate_accounting(client,rows):
    body=analysis_request(rows)
    response=client.post('/analyze',json=body)
    assert response.status_code==200
    assert response.json()==analyze_response(**body)
    assert response.json()['signals']==[]


@pytest.mark.parametrize('changes,status,reason', [
    ({'reviewed_zones':[]},'unreviewed_baseline','baseline_unreviewed'),
    ({'as_of':'2026-09-21T12:00:00-04:00'},'provisional_current_day','current_day_provisional'),
    ({'as_of':'2026-09-21T12:00:00-04:00','reviewed_zones':[]},'provisional_current_day','baseline_unreviewed'),
])
def test_no_formal_verdict_states(client,changes,status,reason):
    body=k1_request(**changes)
    response=client.post('/analyze',json=body)
    assert response.status_code==200
    assert response.json()==analyze_response(**body)
    assert response.json()['signals']==[]
    assert response.json()['daily_points'][0]['status']==status
    assert reason in response.json()['daily_points'][0]['reasons']


def test_insufficient_null_limits(client):
    body=k1_request(n=49,late=20)
    result=client.post('/analyze',json=body).json()
    assert result==analyze_response(**body)
    assert result['daily_points'][0]['upper'] is None
    assert result['daily_points'][0]['status']=='insufficient_data'


def test_generic_runtime_error_never_mock(client,monkeypatch):
    def fail(**kwargs):
        raise RuntimeError('sensitive internal value')
    monkeypatch.setattr(api,'analyze_response',fail)
    response=client.post('/analyze',json=analysis_request([]))
    assert_error(response,500,'analysis_failed')
    assert 'sensitive' not in response.text


def test_unavailable_core(client,monkeypatch):
    monkeypatch.setattr(api,'analyze_response',None)
    assert client.get('/health').json()['analysis_mode']=='unavailable'
    assert_error(client.post('/analyze',json=analysis_request([])),503,'analysis_unavailable')


def test_cors_for_frontend(client):
    response=client.options('/analyze',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'})
    assert response.status_code==200
    assert response.headers['access-control-allow-origin']=='*'


def test_unexpected_value_error_is_runtime_failure(client, monkeypatch):
    def fail(**kwargs):
        raise ValueError('private runtime failure')
    monkeypatch.setattr(api, 'analyze_response', fail)
    response=client.post('/analyze',json=analysis_request([]))
    assert_error(response,500,'analysis_failed')
    assert 'private' not in response.text


def test_both_deployment_import_contexts():
    import subprocess
    code = 'import importlib; m=importlib.import_module("app.app"); assert m.health()["analysis_mode"]=="real"'
    subprocess.run([sys.executable,'-c',code],cwd=ROOT,check=True,capture_output=True,text=True)
    code = 'import app; assert app.health()["analysis_mode"]=="real"; from app.qc import analyze_response'
    subprocess.run([sys.executable,'-c',code],cwd=ROOT/'app',check=True,capture_output=True,text=True)
