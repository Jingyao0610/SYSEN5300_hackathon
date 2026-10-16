# H-04 final acceptance review — 2026-10-16

H-04 covers the local working tool and frontend/backend integration. This record closes the previously pending formal-dataset browser check using the team's committed evidence and a fresh local backend recheck. Deployment remains H-06.

## Source and evidence

- Reviewed main: `3db4409631c565b52e5f5c1265ef8dbeed340521`.
- Julian's actual HTTP/core evidence was merged in PR #2 at `141873a`: [dataset report](DATASET_ACCEPTANCE.md), [machine-readable results](DATASET_ACCEPTANCE.json), and [runner](verify_datasets.py).
- Pingchuan's permanent Chrome browser evidence was committed at `3db4409`: [instructions and scope](../../../app/frontend/acceptance/README.md), [dataset results](../../../app/frontend/acceptance/results/datasets_e189c4b.txt), and [known-answer results](../../../app/frontend/acceptance/results/handoff_e189c4b.txt).
- The browser campaign tested `e189c4b`. A Git comparison confirmed no changes from that commit to the reviewed main in the statistical core, backend, startup script, frontend source, core/API tests, or `data/`. Intervening commits added acceptance scripts, reports and screenshots.

## Definition-of-done checks

| Requirement | Evidence and actual result |
|---|---|
| `pytest tests` passes | Fresh local suite: `175 passed, 1 warning in 2.60s`. Includes K1/K3 and the invalid/insufficient/unreviewed/provisional cases. |
| `bash app/testme.sh` starts the complete tool | Executed from the root of an isolated source copy, with the installed Python/Node dependencies and alternate unused local ports. Vite printed `ready in 1087 ms`; Uvicorn printed `Application startup complete.` The page reported `connected (real mode)`. The script sets `VITE_MOCK=0`. |
| Known answers agree across core, API and UI | Pingchuan's committed real-browser campaign printed `70/70 checks passed`: K1/K3 high and exact-boundary cases, insufficient, unreviewed, current day, small 3/2/1, empty, and extra-column retention. Empty data are blocked by the UI and separately checked through HTTP. |
| Published CSVs agree with the verified core in the UI | Pingchuan's committed dataset campaign printed `110/110 checks passed`: all seven CSVs, 11 dataset/priority runs; import, initial and reviewed responses, coverage, signals, every monitoring row, chart markers/limits, late-incident counts, export, and no mock banner/page errors. |
| Fresh HTTP recheck of the published datasets | `python tests/fixtures/api/verify_datasets.py --endpoint <owned-local-api>/analyze` printed `PASS 12 successful combinations + 1 expected rejection; 37 live HTTP calls; 7 CSVs unchanged`. Executed against the API launched by the original `testme.sh`, not a mocked test client. |
| Existing frontend checks | Vitest printed `Test Files 3 passed (3)` and `Tests 17 passed (17)`. |

The local backend recheck reproduced Jingyao shift/P1 **8** signals, Shifeng shift/P1 **10**, and real NYC priority 2 **8**. Both stable datasets and all regular P2 cases had **0**. Jingyao edge counts were **5118 total / 5107 usable / 11 excluded**, selected P1 **5117 / 5107 / 10**; absent P2 was the expected HTTP 422. Shifeng edge counts were **2934 / 2922 / 12**.

## Attribution and interpretation

The full browser campaigns are **Pingchuan's committed Chrome runs**, reviewed here; they are not claimed as a second full browser replay by Codex on this Windows machine. The Python suite, frontend unit suite, startup check and 37-call HTTP dataset recheck were run locally during this acceptance review. A limited local in-app-browser attempt was superseded by the newly supplied complete Chrome evidence; it contributes no claimed browser pass count.

The browser confirms only usable baselines: A/B for regular synthetic data, EDGE for Jingyao edge, A for Shifeng edge, and BROOKLYN/QUEENS for real NYC. Other edge baselines remain insufficient. These are software-test confirmations, not proof of real operational stability or independence. NYC data are already cleaned, and their first-assignment-to-first-arrival incident metric differs from synthetic response-level records.

CSV export comparisons normalize line endings and the terminal newline. H-04 acceptance does not select a canonical H-02 demo bundle, complete H-05 recording, certify H-06 deployment, or submit H-08. Older pending-browser statements in prior reports are historical and are superseded by this record and the linked `3db4409` browser evidence.

Independent evidence review found no blocker for the quoted CONTRACT definition of done and counted 110 PASS / 0 FAIL plus 70 PASS / 0 FAIL. These browser campaigns do not claim exhaustive interaction coverage, including manual record addition or every stale-result invalidation interaction.
