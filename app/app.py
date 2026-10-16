"""Thin HTTP transport for the independently verified completed-response core."""
# Connect bundles app/ as its content root and loads flat app:app. Declaring
# this package path preserves the same absolute app.qc import in both contexts.
if __name__ == 'app':
    from pathlib import Path
    __path__ = [str(Path(__file__).resolve().parent)]

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt

# Reuse the core's timestamp validator so the API cannot normalize an invalid
# offset into a valid timestamp before the core sees it. No statistics live here.
try:
    from app.qc import analyze_response, _required_timestamp
except ModuleNotFoundError as exc:
    if exc.name != 'app.qc':
        raise
    analyze_response = None


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid', allow_inf_nan=False)
    records: list[dict[str, Any]]
    target_minutes: StrictInt | StrictFloat = Field(gt=0)
    selected_priority: str
    baseline_end: str
    reviewed_zones: list[str] = Field(default_factory=list)
    # Empty default marks omission; explicit null is rejected by the string type.
    as_of: str = ''


def server_clock():
    """One injectable UTC clock sample per analysis request."""
    return datetime.now(timezone.utc)


def error_response(status, code, message, fields=()):
    return JSONResponse(status_code=status, content={
        'error': {'code': code, 'message': message, 'fields': list(fields)}
    })


app = FastAPI(title='Emergency Response Analysis', version='1.0.0',
              description='Daily p charts for recorded completed responses. Synthetic demo data are not clinical standards.')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])


@app.exception_handler(RequestValidationError)
async def invalid_envelope(request, exc):
    fields = sorted({str(item['loc'][1]) for item in exc.errors()
                     if len(item['loc']) > 1 and isinstance(item['loc'][1], str)})
    messages = [f"{'.'.join(str(part) for part in item['loc'][1:]) or 'request'}: {item['msg']}"
                for item in exc.errors()]
    return error_response(422, 'invalid_request', '; '.join(messages), fields)


@app.get('/')
def root():
    return {'message': 'Emergency Response API is running.', 'docs': '/docs'}


@app.get('/__docs__/')
def docs_redirect():
    return RedirectResponse(url='/docs')


@app.get('/health')
def health():
    return {'status': 'ok', 'schema_version': '1.0',
            'analysis_mode': 'real' if callable(analyze_response) else 'unavailable'}


@app.post('/analyze')
def analyze(payload: AnalysisRequest, now: datetime = Depends(server_clock)):
    if not callable(analyze_response):
        return error_response(503, 'analysis_unavailable', 'Analysis is unavailable. Try again later.')
    try:
        observation = (_required_timestamp(payload.as_of, 'as_of')
                       if 'as_of' in payload.model_fields_set else now)
        if observation > now:
            return error_response(422, 'invalid_request', 'as_of must not be later than the server time.', ['as_of'])
        result = analyze_response(
            records=payload.records, target_minutes=payload.target_minutes,
            selected_priority=payload.selected_priority, baseline_end=payload.baseline_end,
            reviewed_zones=payload.reviewed_zones, as_of=observation.isoformat(),
        )
    except ValueError as exc:
        # Core input errors start with the affected argument name. Do not echo
        # imported rows or a framework traceback in the response.
        message = str(exc)
        fields = [name for name in AnalysisRequest.model_fields
                  if message.startswith(name + ' ')]
        if fields:
            return error_response(422, 'invalid_request', message, fields)
        return error_response(500, 'analysis_failed', 'Analysis failed. Please try again or contact the team.')
    except Exception:
        return error_response(500, 'analysis_failed', 'Analysis failed. Please try again or contact the team.')
    try:
        # Serialization failures (e.g. nonfinite output) are runtime errors too.
        return JSONResponse(content=result)
    except Exception:
        return error_response(500, 'analysis_failed', 'Analysis failed. Please try again or contact the team.')
