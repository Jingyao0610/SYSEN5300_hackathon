# Chinese Can Fly — Five-person parallel work plan

This is the detailed English companion to the unchanged [Chinese team plan](team.md).
It preserves the same assignments, decisions, acceptance criteria, and handoffs.

**Project:** Emergency Response, using Python, FastAPI, and React with explicitly labeled synthetic data.
**User:** An ambulance dispatch supervisor reviewing completed responses within one selected priority category.
**Purpose:** Identify unusual changes in the daily proportion of late responses by zone and inspect completed incidents that need human review.
This is operational record review, not medical triage or automatic ambulance dispatch.

[SPEC.md](../SPEC.md) defines the product and statistics; [docs/plan.md](plan.md) defines the implementation plan and tests;
[CONTRACT.yaml](../CONTRACT.yaml) records task ownership and acceptance. This document explains how the five people work together.
Share these documents as a set: forwarding only this plan while keeping an old task ledger will create conflicting instructions.

**Internal submission target: October 17, 2026, at 12:30, America/New_York.**
The repository [event schedule](schedule.md) lists the official deadline as 13:00 and the Showcase as 14:00–15:00.
Use on-site announcements for mentor availability.

> This is an assignment and acceptance plan, not evidence that implementation or testing is complete.
> Data preparation, statistics, explicitly labeled mock interfaces and pages, and deployment preparation may proceed in parallel in separate files.
> Real statistical integration requires verified statistics. Visual polish comes last.

## 1. What each person does

| Member | GitHub handle | Main responsibility | Immediate preparation | Later deliverables |
|---|---|---|---|---|
| **Shifeng Hong** | `sh942-spec` | Statistics, interface agreement, team coordination | Agree on interfaces with Julian and Pingchuan; prepare hand-calculated tests and then the statistical function | Passing K0–K4 and D1–D3; method walkthrough; coordinated task ledger |
| **Jingyao** | `Jingyao0610` | Data, codebook, documentation | Prepare the generator and collection notes around the five agreed CSV columns; generate the three datasets after interface agreement | Demo instructions, root README, app README, verified data descriptions |
| **Julian Jiang** | `Yulinjiang599` | FastAPI, startup scripts, dependencies, integration | Agree on request and response formats; initialize the backend; build an explicit mock interface | Verified core integration, API tests, one-command startup, coordination of end-to-end integration |
| **Pingchuan Liu** | `pl482` | Three React views, demo operation, recording | Agree on response formats; build pages with sample JSON visibly labeled MOCK | Real API integration, state displays, CSV operations, a 2–3 minute demo recording |
| **Hayden Yang** | `haydenYang666` | Deployment, release verification, Devpost | Check permissions and prepare workflows; deploy the health endpoint when Julian's minimal backend runs | Live API and frontend, fresh-clone verification, final submission |

Parallel preparation still has dependencies. Real integration proceeds through statistical verification, API alignment,
page verification, and a complete live demonstration. Hayden reuses Julian's backend and does not build a second one.
Jingyao owns the demonstration text; Pingchuan records it; Hayden independently follows it and handles publication.

## 2. First 30 minutes: agree on the first interface

Shifeng drafts `docs/interfaces.md`; Julian and Pingchuan review it item by item.
Jingyao prepares generation rules while Hayden checks release access.
Complete the H-01 team method walkthrough before claiming the implementation tasks; Shifeng completes H-01 before claiming H-03.
The agreement below defines required behavior, but the complete field types, status enums, and example payloads still need to be written in `docs/interfaces.md`.
Do not treat this plan as an already completed interface document.

### Inputs and plain Python function

- The five CSV columns are `incident_id, zone, priority, dispatched_at, on_scene_at`, with one row per dispatched response.
- Both timestamps must be ISO 8601 values with a UTC offset. Group by dispatch date in `America/New_York`.
- Analyze one `selected_priority` at a time. Keep each zone's baseline separate within that priority.
- `target_minutes` is positive; the default of 10 minutes is illustrative, not a clinical standard. Exactly 10 minutes is on time.
- All callers must use the same plain-function signature:

```python
analyze_response(
    records, target_minutes, selected_priority,
    baseline_end, reviewed_zones, as_of
) -> dict
```

- `reviewed_zones` defaults to an empty list. The supervisor reviews and confirms each zone's baseline before a formal verdict is allowed.
  Confirmation records review; it does not prove independence, stability, or comparability.
- If the API receives no `as_of`, it obtains the current server time and passes it explicitly to the pure function.
  Tests and demos can pass a fixed historical time, but it must not be later than the server's current time.
  **Never infer `as_of` from the dataset's final day.**
- `baseline_end` is local midnight in New York and is exclusive: dispatches at or after the cutoff belong to monitoring.
  The cutoff must not be later than midnight at the start of the local `as_of` day.
- Changing data, the target, priority, or baseline cutoff invalidates the old analysis and clears baseline confirmations.
  New monitoring observations must not silently update a baseline. Historical corrections or additions require an explicitly labeled new analysis.

### API behavior and examples to agree on

- `GET /health` reports runtime health. `POST /analyze` accepts `records` and the settings listed above.
- Required top-level response fields are `meta`, `quality`, `excluded_records`, `zone_baselines`, `daily_points`, `signals`, and `late_incidents`.
- Each `daily_points` item includes at least `zone`, `date`, `n`, `late`, `rate`, `lower`, `upper`, `status`, and `reasons`.
  Use `null` for quantities that cannot be calculated; do not substitute zero.
- `quality` distinguishes counts for all imported rows from counts for the selected priority.
  Count an excluded row only once, even if it has several errors: total rows = usable rows + excluded rows.
- Write full request and response examples in `docs/interfaces.md`, agreeing on every field's type, units, missing-value behavior, and status enumeration.
  Cover no signal, a signal, insufficient data, row-level errors, an unreviewed baseline, and the provisional current day.
- Invalid analysis parameters or an import structure missing required columns return HTTP 422.
  A recognizable structure with individual invalid rows returns HTTP 200 with explicit exclusion reasons.
  Three imported rows containing two usable rows and one invalid row must display counts of 3/2/1.
  If no rows are usable, return empty results with reasons, not zero delay or a successful control verdict.
- `high`, `low`, and `no_signal` apply only to monitoring days that meet every formal-verdict condition.
  Insufficient, unreviewed, and provisional states must not be presented as “normal.”

For an interface change, the proposer explains its effects; Shifeng, Julian, and Pingchuan confirm it.
Update the agreement and affected tests before changing the implementation.

## 3. File ownership and task IDs

Use only the existing **H-01 through H-08** tasks. Backend and frontend share **H-04**:
Julian is its owner and Pingchuan its frontend collaborator. These are roles, not separate H-04a/H-04b tasks.

| Task | Owner / collaborator | Writable paths and boundaries |
|---|---|---|
| H-01 — Specification and interfaces | Shifeng coordinates the team | `SPEC.md`, `docs/plan.md`, `docs/team.md`, `docs/team.en.md`, `docs/interfaces.md` |
| H-02 — Data | Jingyao | `data/`: three CSVs, generator, codebook |
| H-03 — Statistics | Shifeng | `app/qc.py`, `tests/test_qc.py`, `tests/fixtures/qc/`; no dependency-file or API-test edits |
| H-04 — Backend and frontend | Julian / Pingchuan | Julian: backend, four-script contract, `app/requirements.txt`, `tests/test_api.py`, `tests/fixtures/api/`. Pingchuan: `app/frontend/`. Exclude H-03 files and Hayden's release files |
| H-05 — Demonstration | Jingyao / Pingchuan | Jingyao alone writes `demo/README.md` and other demo text; Pingchuan alone writes `demo/recordings/`. Page fixes remain H-04 work |
| H-06 — Deployment | Hayden | `.github/workflows/`, `.github/scripts/`, `app/manifest.json`, `app/.python-version`; separate API and React deployment workflows |
| H-07 — Documentation | Jingyao | Root `README.md` and `app/README.md`; module owners supply content rather than editing them concurrently |
| H-08 — Reproducibility and submission | Hayden | `.gitignore`; fresh-clone checks, public-link verification, Devpost submission |

The English companion is included in H-01's current ledger ownership. It does not replace or modify the Chinese plan.

### Initialization exceptions and explicit handoffs

1. **Julian initializes `app/` once.** Copy the necessary files from `demos/fastapi/`.
   Do not copy the entire starter over existing statistics, frontend, manifest, or Python-version files.
2. **Only Julian edits `app/requirements.txt`.** Shifeng supplies the needed libraries at the start, and Julian pins the dependencies.
   Passing the statistics task must not depend on undocumented manual installations.
3. Julian may create the starter `app/README.md` while initializing H-04.
   Hand it explicitly to Jingyao for H-07; after that, Julian supplies suggestions instead of editing it.
4. Hayden maintains `app/manifest.json` and `app/.python-version`.
   Julian supplies the entry point, dependencies, compatible runtime, and manifest-generation script; Hayden generates and updates the actual manifest.
5. When adapting the React starter, Pingchuan removes its example statistics module, associated tests, stale imports, and old chart calls.
   Deleting only `src/spc.js` while leaving references is insufficient.
6. Pingchuan configures the frontend's API origin; deployment injects it through build-time environment configuration.
   Keep the actual course-server configuration and credentials out of source and documents. Julian configures cross-origin access; both verify the live connection.
7. Only one person writes a given file at a time. Obtain a handoff from its owner before fixing someone else's module during integration.

## 4. Deliverables and acceptance for each person

### Shifeng — Statistical core and method explanation

All response durations, exclusions, counts, proportions, control limits, signals, and day-of-week summaries live in `app/qc.py`.
The function has plain inputs and outputs and does not import FastAPI. Neither API code nor JavaScript calculates statistics.
Load `stats-first-steering` before implementing the statistic.

The method is a daily p chart of late completed responses, separately for each zone within the selected priority:

```text
t = (on_scene_at - dispatched_at).total_seconds() / 60
y = 1 if t > target_minutes else 0

n = number of usable completed responses for the day
d = sum(y) for that day
p = d / n                         (null when n = 0)
p_bar = sum(baseline d) / sum(baseline n)

SE = sqrt(p_bar * (1 - p_bar) / n)
LCL = max(0, p_bar - 3 * SE)
UCL = min(1, p_bar + 3 * SE)
```

The baseline includes only dispatches before `baseline_end`; it is a weighted proportion, not the average of daily proportions.
Use unrounded values for decisions and an absolute tolerance of `1e-12` for proportion-boundary comparisons.
Only strict crossings signal; equality with a limit does not. Do not add run rules.
Display percentages as `100 * p`, while retaining full precision for decisions.

A formal verdict requires a closed local day, a reviewed baseline with at least 20 nonempty baseline days,
and both expected-count conditions: `n * p_bar >= 5` and `n * (1 - p_bar) >= 5`.
No baseline, a baseline rate of 0 or 1, no observations, or failed conditions means no formal control verdict.
The current day can show observed counts and rate but remains provisional.

| Test | Required result |
|---|---|
| K0 — Duration and target equality | 09:00→09:10 is 10 minutes and is not late. Arrival at 09:10:01 is `10 + 1/60` minutes and is late |
| K1 — Fixed baseline, n=100 | Twenty baseline days with 10/100 late each give 200/2000 and `p_bar=0.10`. For monitoring n=100, SE=0.03 and limits are [0.01, 0.19]. d=0 is low; d=1 or 19 has no signal; d=20 is high |
| K2 — Unequal baseline sample sizes | Ten days of 6/100 plus ten days of 34/300 give 400/4000=0.10. The incorrect unweighted daily-rate mean is about 0.0866667. Adding monitoring records must not change the baseline; unchanged settings and n retain the same limits |
| K3 — Same baseline, n=400 | SE=0.015 and limits are [0.055, 0.145]. d=21 is low; d=22 or 58 has no signal; d=59 is high |
| K4 — Day-of-week summary | Two dates in the same weekday category with 6/100 and 34/300 must aggregate to 40/400=10%, not a mean of the two daily rates |
| D1 — Insufficient or degenerate groups | Empty data, n=1, fewer than 20 nonempty baseline days, no baseline, and `p_bar=0` or 1 receive no formal verdict. With `p_bar=0.1`, n=49 fails the expected-count threshold and n=50 meets it |
| D2 — Invalid records and accounting | Missing, malformed, reversed, or future timestamps, empty required fields, and duplicate IDs have explicit exclusion reasons. Exclude every row sharing a duplicate ID. Count each excluded row once and reconcile total = usable + excluded |
| D3 — Time boundaries | With `as_of=2026-10-16T12:00:00-04:00`, that day's 20/100 is a provisional 20% with no formal signal. October 15 at 23:55→October 16 at 00:05 is 10 minutes and belongs to October 15. A dispatch exactly at `baseline_end` belongs to monitoring |

The K1–K3 signal examples assume all other conditions are met, including baseline review and day closure.
Daily limits vary with that day's n: a frozen baseline does not imply identical limits on every day.
K4 is descriptive aggregation, not another significance test.

Show baseline daily rates, sample sizes, and weekday summaries so the supervisor can assess comparability and possible periodicity.
The minimum-day and expected-count policies do not prove independence, stability, or comparable case mix.
Say “no crossing signal found,” not “proven in control.” The operational target and statistical control limits serve different purposes.
A stable late rate can still miss the operational target; an individually late incident is not automatically a statistical outlier.
Baseline-relative signals are not a raw ranking of zone quality. Day closure also does not prove that every response has been completed or logged.
Keep coverage limitations visible: the analysis represents usable, recorded completed responses, not all calls, cancellations, or outstanding responses.

**Acceptance and handoff:** Run `pytest tests/test_qc.py`, covering K0–K4, D1–D3, and the frozen baseline.
Obtain an independent `stats-reviewer` PASS/FAIL table with expected and actual numbers.
Julian or Jingyao also checks one hand-calculated example and one boundary case.
Hand Julian the verified function, deterministic fixtures, actual test output, and any remaining assumptions.
Unfinished API tests must not block this statistical unit-test check; the full suite remains required for H-04 integration.

### Jingyao — Data, then demo instructions, then READMEs

Follow **H-02 → H-05 → H-07**, claiming only one active task at a time.

- Use `data/generate.py` and seed **5300** to create `stable.csv`, `zone_shift.csv`, and `edge_cases.csv`.
- The first two datasets contain 2 zones × 2 priorities, with 100 responses per group per day and dispatches between 08:00 and 20:00.
  Baseline dates are September 1–20, 2026; monitoring dates are September 21–30, 2026. Their baseline records must be identical.
- The stable generating probability of lateness is **0.15**. In the shift dataset, change only zone A / priority P1 during monitoring to **0.35**.
  Generate positive durations consistent with the late/on-time classification. Generation probabilities do not guarantee realized proportions.
  Do not search for a seed that suppresses false alarms or produces an attractive chart.
- Use demo settings `baseline_end=2026-09-21T00:00:00-04:00` and `as_of=2026-10-01T00:00:00-04:00`.
  Boundary scenarios can use their own explicitly stated analysis times.
- `edge_cases.csv` covers insufficient samples, missing/reversed times, duplicate IDs, cross-midnight responses, and the other agreed edge cases.
  Exact K fixtures are separate deterministic inputs: do not expect a random CSV to reproduce K1's counts or limits.
- Label every dataset **synthetic**. In `data/README.md`, document every file and field, units, timezone, priority labels, target, cutoff,
  seed, generating assumptions, planted changes, and who would record each field, when, and how in a real dispatch setting.
  Use no real patient information.
- For H-02, verify reproducibility, target-boundary behavior, identical baseline records, and the intended D1/D2/D3 coverage.
  The ledger check must list the three CSVs and confirm that the codebook describes all files and columns.
- After H-02, write `demo/README.md` under H-05. For each CSV specify the exact command or URL, fixed settings,
  what to click, the actual numbers/chart, and one sentence explaining how to read it.
  Before statistical validation, write procedures only; do not invent expected outputs.
- After H-05 acceptance, write the root `README.md` and `app/README.md` under H-07.
  Julian supplies installation and API details, Pingchuan page instructions, and Hayden deployment/access instructions.
  Cover the user, purpose, every input and parameter, functions/endpoints, assumptions, one-command startup, live access, references, and the demo link.

**Acceptance and handoff:** Supply the generator, CSVs, codebook, and actual checks to Shifeng and Julian.
Supply the verified demo script to Pingchuan for recording and Hayden for independent playback.
Hayden must follow it without having written it; return discrepancies to the responsible module owner.
The document author cannot substitute for this independent acceptance check.
For H-07, a teammate who did not write the code follows the documentation from a fresh clone, starts the tool, and reproduces the documented behavior.

### Julian — FastAPI, dependencies, and integration

- Implement requests, parameter validation, and error responses from the agreed interface; call `analyze_response` for all statistics.
- The API supplies the default `as_of` and checks that a supplied value is not in the future.
  The statistical function handles record validity, including timestamps later than `as_of`.
- Maintain dependencies and the four-script contract: `testme` starts locally, `manifestme` generates the manifest,
  `deployme` deploys, and the app README explains usage. Coordinate frontend startup so `bash app/testme.sh` runs the complete tool from the repository root.
- Give Hayden the minimal runnable backend entry point early. This is the shared backend, not a separate deployment prototype.
- Mock mode must be explicitly enabled and visibly labeled.
  **Never automatically return example JSON after an import failure, a missing function, or an exception.** Formal mode reports the real error.
- After H-03 verification, integrate the real function with both `reviewed_zones` and explicit `as_of`.
  Test K1/K3, HTTP 422, row-level exclusions, no usable records, unreviewed baselines, and the provisional current day.

**Acceptance and handoff:** Run `pytest tests`; all tests must pass.
The same deterministic input must yield the same numbers through the core, API, and UI, and one synthetic CSV must complete the whole flow.
Keep invalid, insufficient, unreviewed, and provisional cases explicit, with mock mode disabled for formal analysis.
Give Pingchuan the tested API behavior and Hayden the entry point, dependencies, runtime information, and successful checks.
H-04 is done only after backend, frontend, one-command startup, and end-to-end checks all pass.

### Pingchuan — Three React views and the recording

- **Data & Settings:** Import CSV, add a completed response with Save/Cancel, export CSV, preview raw records/exclusion reasons,
  choose priority, target, baseline cutoff, and optional historical `as_of`, then run analysis. An import replaces the current session.
- **Zone Monitoring:** Filter zones; show daily late rates, daily n, corresponding control limits, baseline and weekday checks,
  per-zone baseline confirmation, and the list of days requiring review. Provide navigation to incidents and back to data.
- **Incident Review:** Filter late completed incidents by zone/date, sort by response minutes or time, clear filters, and return to the chart.
  Show exclusions and record-coverage limitations.
- All three views show New York timezone, analysis time, target, and usable/excluded counts.
  Give unreviewed, insufficient, and current-day provisional states distinct, clear messages; do not render them all as green “normal.”
- React parses/exports CSV, sorts, and displays results; it does not recalculate response durations, proportions, limits, or signals.
  Data additions, corrections, or key-setting changes clear stale results and baseline confirmations. Records are kept in the current browser session.
- Start with sample fixtures explicitly labeled **MOCK**, then connect the verified real API after H-03 passes.
  A page or chart alone is not completion. Use build-time API-origin configuration and verify the live connection with Julian.
- After H-04 handoff and a successful real online flow, record 2–3 minutes following Jingyao's demo instructions.
  Write recordings only in `demo/recordings/`, or provide an accessible sharing link; do not push large videos directly into Git.

**Acceptance and handoff:** Check K1/K3 values and every agreed error/provisional state against the API; complete the CSV flow.
Transfer the finished recording to Hayden for submission and report the tested version and any unresolved issues.
H-05 recording work begins after the H-04 handoff; frontend repairs remain H-04 work.

### Hayden — Deployment, reproduction, and submission

- Prepare workflows and check repository access early. Deploy Julian's minimal health endpoint when it is ready.
  This checks the deployment path; **a health-only deployment does not complete H-06**.
- Load `connect-publish` and `posit-dlc`. Use the supplied API and static-React workflows and their helper scripts.
  Deploy to the course **Posit Connect** server, API first and React second; configure API `APP_DIR` as `app` and the frontend build for `app/frontend/`.
  Generate the backend manifest using Julian's script; maintain it and the Python-version file. Frontend build artifacts remain generated.
- Pass the API origin through frontend build configuration. Put credentials and actual course-server configuration in GitHub Secrets,
  including `CONNECT_SERVER` and `CONNECT_API_KEY`, not in source, logs, documents, or chat.
- For final release, disable mock mode and verify both deployment workflow runs are green.
  Open both the API and frontend while logged out, submit deterministic test inputs, and verify K1 numbers and insufficient-data behavior.
  HTTP 200 by itself is not sufficient evidence.
- After H-06, independently follow the H-05 demo as a teammate who did not write it, then move to H-08.
  Clone into an empty directory, follow the README, start with one command, run all tests, and reproduce the demonstration.
  Julian supports runtime and dependency repairs. Check for actual credentials; a key-name placeholder is not a secret value.
- Submit on Devpost before **12:30 on October 17**, verify the public repository, live tool, and demo links, and keep the submission confirmation.
  The 2–3 minute video is the team's plan, not an unverified claim about an official mandatory length.
- Coordinate Git conflicts. Shifeng decides conflicts affecting statistics; do not resolve them by blindly choosing one side.

**Acceptance and handoff:** Record workflow outcomes, anonymous-access checks, actual numeric comparisons, independent demo results,
fresh-clone output, and submission confirmation. A failure goes back to the relevant owner before completion is claimed.
Hayden's central deployment role is a team arrangement, not a claim that only a repository owner can create secrets.
GitHub documents repository-secret access for collaborators on personal repositories; environment-secret permissions differ (see references).

## 5. Parallel timetable and dependency gates

The phases below are team targets and may shift with current progress; **the 12:30 submission target does not move**.
Each person claims one active task at a time and finishes its handoff before starting the next.

| Phase | Shifeng | Jingyao | Julian | Pingchuan | Hayden |
|---|---|---|---|---|---|
| First 30 minutes | Draft interface; explain K1 | Prepare generation rules and field notes | Review interface; list dependencies | Review interface; sketch three views | Check permissions; prepare workflows |
| Next approximately 2–3 hours | H-03: K/D tests and statistical core | H-02: three CSVs and codebook | H-04: explicit mock interface, scripts, validation | H-04: mock pages and all states | H-06: workflow preparation, then health deployment after the minimal backend arrives |
| First real integration | Deliver verified statistical output | After data completion, start H-05 text | Connect real function; run API tests | Connect real API; check charts and states | Run first complete deployment |
| Evening target: before 23:00 | Check live numbers | Add actual demo results; move to H-07 after H-05 acceptance | Repair API/dependency issues | Move to H-05 recording after H-04 passes | Verify live tool; independently replay H-05, then move to H-08 |
| Saturday, October 17, 08:00–10:00 | Rehearse explanation; support statistical fixes | Finalize READMEs and demo descriptions | Support reproduction and bug fixes | Re-record if needed; rehearse presentation | Fresh-clone checks, independent replay, link checks |
| Saturday, October 17, 10:00–12:30 | Necessary fixes only | Keep documents aligned with actual results | Preserve a working version | Preserve a demonstrable version | Submit and confirm success |

Take turns resting overnight. Name the handoff recipient, unresolved issues, and most recent verified version; nobody is required to stay awake all night.
Follow on-site mentor availability and bring runnable results or a concrete question. Preserve the planned 3–4 hour integration/submission buffer.

- **Gate A — Interface agreed:** Participants read the complete examples and agree on fields, units, missing states, and explicit mock behavior.
- **Gate B — Statistics verified:** K0–K4, D1–D3, and independent review pass before statistical output is integrated as trusted analysis.
- **Gate C — Complete flow:** The same deterministic K input agrees across core, API, and UI; a random CSV agrees with the verified core;
  errors and provisional states remain visible.
- **Gate D — Formal release:** No mock responses; anonymous access and complete real analysis pass. This is required to complete H-06 and record the final live video.

H-01–H-04 should check in as soon as their own acceptance criteria pass; they do not wait for deployment.
H-05, H-07, and H-08 finish under their own later acceptance criteria, including the planned independent playback and reproduction checks.
Documentation numbers come from verified actual runs; confirm the final demonstration against the live tool.

## 6. Scope control

Keep the existing SPEC/plan commitments: CSV import/export, single-record entry, three views, statistics and data-quality messages,
baseline review, three datasets, deployment, and documentation.

- **Keep:** Insufficient-data decisions, absent/degenerate baseline handling, record exclusions, provisional current-day behavior,
  usable counts, baseline review, and the real API connection.
- **Simplify presentation if needed:** Use a simple weekday table, a list or plain line chart for baseline checks, and restrained styling.
  Retain K4's calculation and tests.
- The visible historical-`as_of` input may come later, but the API must still accept an explicit historical value and the demo must use its fixed time.
  The dataset's last date never substitutes for “now.”
- Removing a committed feature such as export or manual entry requires team agreement and coordinated SPEC, plan, interface, and acceptance updates.
  Do not silently remove it in the frontend.
- If the real end-to-end flow is still incomplete at 23:00, stop polishing and adding features; focus on statistics, interfaces, and deployment.
  Continue explaining frozen baselines, independence assumptions, and record-coverage limitations.
- Keep the agreed exclusions: no logins, persistent database, real patient data, live 911 integration, maps, routing, automatic assignments,
  clinical decisions, causal explanations, mortality/open-incident predictions, capability indices, or extra statistics before the first is verified.

## 7. Git and task-ledger collaboration

1. Shifeng alone edits `CONTRACT.yaml`. Everyone else reports the task ID, start time, changed paths, and exact acceptance output;
   their AI must not edit the ledger.
2. An assigned owner does not mean a task has started. Keep `todo`, `in_progress`, and `done` truthful.
   Completion requires actual acceptance. A document check cannot replace the H-01 team method walkthrough.
3. Start from the latest shared version, use separate local clones and role branches, and commit small readable changes.
   Stage explicit paths; never use `git add .` or `git add -A`.
4. Every PR identifies the H-ID, file scope, and actual test output. Shifeng coordinates ledger status; Hayden coordinates merging.
   The completed work and its `done`/`result` update enter the main branch in the same merge commit.
   A message saying “finished” is not acceptance evidence.
5. H-04 has separate backend/frontend paths but one completion state. Mark it done only after both parts and complete integration pass.
6. Do not use `git pull --rebase && git push` as an unconditional repair. Save or commit your work first.
   If conflicts occur, stop and ask the file owner to confirm the content; Hayden assists with resolution. Do not force-push the main branch.
7. Inspect the diff and run the task's checks before submission. Report their actual output.
   Planning-document checks do not prove the app runs, and a deployed health endpoint does not prove analysis is live.

## 8. Starter prompts for each person's AI

Use these after the interface document is finalized, the H-01 team walkthrough is complete,
and Shifeng has checked out the relevant task in the ledger. First synchronize SPEC, plan, team documents, and CONTRACT.
These are prompts for future implementation sessions, not instructions to execute while reading or translating this document.

**Common prefix — everyone pastes this first**

```text
Read SPEC.md and CONTRACT.yaml first, then CLAUDE.md, AGENTS.md,
docs/plan.md, docs/team.en.md, docs/team.md and docs/interfaces.md.
Load the relevant skills. Follow the approved parallel-preparation workflow:
mock development is allowed in separate files, but real statistical integration
requires passing known-answer and degenerate tests. No statistics in API/UI code.
Work only on my assigned task and paths. Shifeng alone edits CONTRACT.yaml;
report status and exact test output to me for coordination instead.
Do not deploy, commit or push without my explicit instruction.
Show the diff and actual verification output. Do not call mock output real analysis.
```

**Shifeng — H-03**

```text
Implement H-03 only: app/qc.py, tests/test_qc.py, tests/fixtures/qc/.
Load stats-first-steering. Preserve reviewed_zones and explicit as_of in the
agreed function signature. Write K0-K4 and D1-D3 tests, then implement the
plain Python function. Request dependencies from Julian; do not edit requirements.
Run pytest tests/test_qc.py and obtain independent statistical review.
Report numeric expected/actual results, failures and remaining assumptions.
```

**Jingyao — H-02**

```text
Implement H-02 only in data/. Use seed 5300 to generate stable.csv,
zone_shift.csv and edge_cases.csv exactly as specified. Preserve the same
baseline in stable and shift data. Do not search for a seed with no false alarms.
Write a codebook with units, assumptions and who records each field, when and how.
Do not invent expected analysis outputs. Stop at the H-02 handoff; H-05 and H-07
are separate later tasks after Shifeng updates the ledger.
```

**Julian — H-04 backend**

```text
Implement the backend portion of H-04 only, following the team-plan ownership.
Initialize the FastAPI starter without overwriting qc.py, frontend, manifest.json
or .python-version. Own requirements, backend scripts, API code and API tests.
Keep the initial app/README as a minimal starter, then hand it to Jingyao for H-07.
Use explicit mock mode only; never fall back to example JSON after a real error.
After H-03 passes review, call the real analyze_response including reviewed_zones
and as_of. Test K1/K3 and error/provisional states, then run pytest tests.
Coordinate the end-to-end handoff with Pingchuan and Hayden.
```

**Pingchuan — H-04 frontend, followed by H-05 recording**

```text
Implement the frontend portion of H-04 only in app/frontend/. Use React/Vite.
Remove the demo statistics module, its tests and all stale imports/calls.
Use explicitly labeled mock fixtures until H-03 is verified, then the real API.
Build all three views and show insufficient, unreviewed and provisional states.
Keep baseline review, stale-result invalidation and data-quality counts.
Use build-time configuration for the API origin; do not commit the course URL.
Do not calculate response statistics in JavaScript. After H-04 handoff, coordinate
with Jingyao on H-05; write recordings only in demo/recordings/, not demo/README.md.
```

**Hayden — H-06**

```text
Prepare H-06 only in its assigned paths. Load connect-publish and posit-dlc
before deploying. Use Julian's minimal backend; do not create another app.
Keep API and static frontend deployments separate. Store credentials and course
server configuration in GitHub Secrets, not source, logs or chat.
A health-only deployment is a preparation check, not H-06 completion.
Before final release verify mock mode is disabled, anonymous access works, and
known-answer plus insufficient-data cases agree with the verified core.
Report actual checks. H-08 is a later task; do not submit Devpost in this task.
```

## 9. References and final team check

- Project definition: [SPEC.md](../SPEC.md); implementation/test plan: [docs/plan.md](plan.md); task ledger: [CONTRACT.yaml](../CONTRACT.yaml).
- Original Chinese counterpart: [docs/team.md](team.md). Share it and this English document with the same current project documents.
- Event timing: [docs/schedule.md](schedule.md); judging rubric: [docs/criteria.md](criteria.md).
- Statistical method: [NIST proportions control charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm).
  The p chart is a cited quality-control extension beyond the coverage listed in the updated course glossary;
  the team must explain its method, assumptions, and hand calculations.
- Permissions: [GitHub documentation on creating repository secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-a-repository).
- Public team repository: [haydenYang666/SYSEN5300_hackathon](https://github.com/haydenYang666/SYSEN5300_hackathon).

Before release, every member should be able to explain their inputs and outputs, one known answer, one failure case,
and the exact files or verified results they hand to the next person.
