# Live Simulation

Live Simulation is an optional demonstration tab in the existing response monitor. It generates **synthetic completed responses** and sends them to the real analysis API. It is not connected to an ambulance service, a live dispatch feed, or patient records. The prominently labelled **SIMULATED** clock is historical demonstration time.

The simulation has its own records and results. Switching tabs preserves the imported CSV session and pauses the simulation. Refreshing or closing the page loses the in-memory simulation; export it first if needed.

## Fixed setup

| Setting | Value |
|---|---|
| Default seed | `5300`; any whole number from `0` to `4294967295` is accepted |
| Zones and priority | A and B; P1 |
| Operational target | 10 minutes, illustrative rather than a clinical standard |
| Baseline dates | September 1–20, 2026; 100 responses per zone per day |
| Exclusive baseline cutoff | `2026-09-21T00:00:00-04:00` |
| Initial simulated observation time | `2026-09-21T00:00:00-04:00` |
| Daily grouping | Dispatch date in `America/New_York` |
| One advance | Six simulated hours and 50 completed responses: 25 in each zone |
| Run limit | 40 advances, ten monitoring days, 6,000 total records |

Seed 5300 produces these fixed baseline counts. They are realized counts, not the generating probabilities:

| Zone | Late / completed | Baseline late rate |
|---|---:|---:|
| A | 270 / 2,000 | 0.135 = 13.5% |
| B | 302 / 2,000 | 0.151 = 15.1% |

The baseline contains 4,000 records and starts unreviewed. Monitoring appends records without changing this baseline. A different seed creates a different reproducible dataset; seeds are not searched or resampled to produce a desired chart.

## Use the controls

1. Open **Live Simulation**, keep seed 5300 or enter another valid seed, and choose **Load baseline**. Wait for the real API result.
2. In the existing zone chart, inspect the baseline days and weekday breakdown. Confirm A and B separately using **Baseline reviewed for zone…** when appropriate. Nothing confirms them automatically. Playback must be paused before a review checkbox can be used.
3. Choose **Advance 6 hours** for one update, or **Start** for repeated updates. The speed selector inserts 0.5, 1.5, or 3 seconds between completed API updates. It changes playback speed, not simulated time per step or sample sizes.
4. Change **Future records** to **Zone A slower** to introduce a deterioration in later batches. Return to **Normal conditions** to restore the normal generating probability for later records. A switch does not rewrite earlier data, prior scenario labels, or the baseline.
5. Use **Pause** to stop scheduling updates. An already-running request can finish. Leaving the tab also cancels an outstanding request and discards its pending step; returning does not automatically resume playback.
6. Use the chart's incident links or **Simulation incidents** to inspect late completed responses. Opening incident review pauses playback. The table distinguishes individual lateness from formal daily signals.
7. Use **Reset simulation** to load the chosen seed again. A successful reset returns to step 0 and normal conditions, clears the scenario schedule, and clears baseline confirmations. It does not erase imported CSV records.

Normal conditions use a generating late probability of 0.15 in both zones. Zone A slower changes that probability to 0.40 for A only; B keeps the same draws and generating conditions. Durations are positive, IDs are unique within a run, and every generated arrival is no later than that step's simulated observation time. These simplified independent synthetic assumptions are not an empirical model of emergency-service demand or performance.

## Read the results

All late counts, rates, weighted baseline estimates, control limits, and verdicts come from the unchanged Python core through the API. The browser generates records and displays returned results; it does not implement a second statistical calculation.

An unfinished simulated day is provisional. After four advances, the first monitoring day has ended and its 100 responses per zone may receive a formal verdict if its baseline is usable and reviewed. Early partial days can instead be labelled insufficient because the expected-count condition fails; a provisional reason remains visible when applicable. No formal signal is issued for insufficient data, an unreviewed baseline, or the current simulated day. Refer to [the interface contract](interfaces.md) for the exact status precedence and limits.

The 10-minute target defines whether an individual response is late. The statistical limits compare a daily late share with that zone's fixed baseline. Neither a signal nor a baseline confirmation establishes causation, independence, operational stability, or clinical safety. Normal generating conditions can still produce chance signals.

## Failure and recovery

Updates are serial: a subsequent step is scheduled only after the previous analysis completes. Records, observation time, review flags, and the scenario schedule are committed only after a successful real API response. While waiting, any displayed chart is explicitly labelled as the last successful snapshot.

An API failure or a 15-second timeout pauses playback and displays an error while retaining that snapshot. Retry the action to reproduce the failed candidate using the same seed and scenario, or reset. A scenario change before retry intentionally changes the future candidate. Reset and navigation cancel pending requests; late responses cannot overwrite a newer session.

Simulation is disabled in MOCK mode and rejects mock analysis output. There is no silent fallback to precomputed results. The fixed historical observation times still pass through the API's normal timestamp and future-time validation.

## Export and replay

**Export simulation CSV** saves the last successfully analysed records, including the five incident columns and four provenance columns: `synthetic`, `scenario`, `simulation_seed`, and `simulation_step`. Baseline rows have scenario `baseline` and step `0`; monitoring rows record `normal` or `zone_shift`. Do not concatenate runs with the same seed: their reused identifiers would be duplicates.

**Export replay settings** saves JSON containing the generator version, seed, completed step count, scenario schedule, simulated clock/timezone, and exact analysis settings including `as_of` and reviewed zones. Keep this file with the CSV.

To compare the saved result in the ordinary import workflow, import the CSV alone, apply the exported target, priority, baseline cutoff and observation time, then confirm the listed usable baselines. Import initially starts with no baseline confirmations. Extra provenance columns are retained for export and ignored by the statistical core.

To regenerate the stream, use `createSimulation(seed)` from [simulation.js](../app/frontend/src/simulation.js), then call `advanceSimulation(session, scenario)` for steps 1 through the exported `steps`. For each step, use the most recent `scenario_schedule` entry whose `from_step` is less than or equal to that step. The current UI does not import replay JSON automatically; the same schedule can be followed with single advances and the future-scenario control.

## Verification

With the repository's frontend and backend dependencies installed, run from the repository root:

```bash
npm --prefix app/frontend test
npm --prefix app/frontend run build
pytest tests
node app/frontend/acceptance/simulation_core_check.mjs
```

The last command defaults to `python3`; set `PYTHON_BIN` to the Python executable containing the backend dependencies if needed. It sends the actual JavaScript-generated records to the Python core and an in-process FastAPI TestClient, compares complete responses, independently counts timestamp-derived lateness, and checks frozen baselines, partial/closed days, unreviewed states and scenario-history preservation. It does not run a browser or verify a remote deployment.

Generator tests cover deterministic seeds, append-only records, scenario isolation and the run cap. Controller tests cover serial playback, pause/review behavior, cancellation, stale-response rejection, retry, timeout and replay metadata. Render tests distinguish provisional-only days from completed no-signal days and high signals.

## Acceptance record — October 16, 2026

The frontend's package scripts were executed with pnpm using the existing package-lock versions (no dependency change). Output: `Tests 37 passed (37)`; final integrated production build: `52 modules transformed`, `built in 5.73s`. Backend output: `175 passed, 1 warning in 2.72s` (the existing Starlette/AnyIO deprecation). Actual generated-record verification printed:

```text
10/10 generated-stream core/API cases PASS; frozen baselines, day closure and mixed-scenario history PASS
Seed 5300 baseline: {"A": [2000, 270, 0.135], "B": [2000, 302, 0.151]}
```

In the real-mode local browser, seed 5300 / Zone A slower gave 25 late of 75 at step 3 (September 21, 18:00), still provisional with zero formal signals. Step 4 closed that day at 36/100, 36.0%, with displayed limits 3.2%–23.8% and one high signal. Both reviewed baselines remained fixed. Start/pause, single advances, leaving/returning to the tab, and reset were exercised.

An exported step-7 run contained 4,350 rows, all `synthetic=true`: 4,000 baseline, 300 zone-shift and 50 normal rows. The JSON schedule recorded zone-shift from step 1 and normal from step 7, with the exact observation time and A/B review flags. The normal import tab retained the separate three-row `small.csv` fixture after simulation; returning retained the simulation snapshot.

The local API was deliberately stopped at step 8. The browser displayed the connection failure and stayed paused at 4,400 rows with the prior successful clock/result. Restarting the API and retrying advanced to step 9. No fabricated response was substituted. Local integration was checked with the teammate's supervisor-console UI and its light/dark theme controls.

Commit `8815a1b` was published by GitHub Actions run `38985494228` (successful build, publish and HTTP check). In the existing deployed site's real mode, seed 5300 loaded 4,000 usable rows; confirming the two baselines and advancing the slower-A scenario to step 4 reproduced 36/100 and one high signal. Switching the ordinary example to NYC and then zone_shift preserved the separate simulation's 4,200 rows and result. The local full run also stopped automatically at step 40 with 6,000 usable rows, ten high days in A and no formal signals in B.

## Example and import request ordering

The random first-visit example remains a random selection from the existing showcase CSVs. It does not generate a stream. Live Simulation retains its own seeded records and analysis, and switching ordinary examples does not reset it.

The follow-up fix rejects obsolete work throughout ordinary example download, CSV reading and analysis. A new input intent or analysis cancels the previous request and invalidates its completion token; an old success, failure or cleanup cannot restore obsolete data, results, errors, busy state or navigation. Cancellation also covers operations whose underlying transport ignores abort. The latest settings always require their own successful analysis. Example downloads validate the HTTP status before parsing.

The follow-up passed 17 request-ordering regressions, including stale downloads, responses, errors, navigation and reversed file-read completion. The complete frontend suite printed `Test Files 7 passed (7); Tests 54 passed (54)`. Production build printed `53 modules transformed; built in 5.29s`. Re-running the unchanged backend printed `175 passed, 1 warning in 2.41s`; generated-stream verification again passed all 10 cases.

In the local React StrictMode browser, first-visit random loading completed normally. Loading the NYC example and immediately changing the target to 20 left the page at 20 with no current result after the old request completed; explicitly running again returned an analysis at 20. Loading zone_shift and confirming its baselines still produced eight signals. Importing small.csv then replaced the session with three rows and invalidated the prior result. Independent code review found no blocking issue in the integration. Deployment verification for this follow-up is pending.
