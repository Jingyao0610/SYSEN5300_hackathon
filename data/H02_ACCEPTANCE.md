# H-02 final dataset acceptance — 2026-10-16

H-02 is accepted using **Jingyao's three reproducible synthetic CSVs** as the primary demonstration bundle. Shifeng's three synthetic CSVs and Hayden's real NYC extract remain separate supplements. All seven original CSVs are preserved; this check-in changes documentation, the verifier's final status message and the task ledger, not data or statistical logic.

## Acceptance scope

The SPEC requires 2–3 datasets covering stable behavior, a planted change and edge cases, with a complete codebook. The primary bundle supplies exactly those three files under `data/jingyao_synthetic/`. The former root-only `ls data/*.csv` no longer matched the user-requested collection folders; the CONTRACT now checks the explicit primary folder and keeps the three-file requirement. [The root data index](README.md) names all seven files and links their separate codebooks.

| Primary file | Rows | SHA-256 of accepted CSV bytes |
|---|---:|---|
| `stable.csv` | 12,000 | `7dff735aabb8bf8dfddca5c98f734a1b4dfed973a9f0e3172d900f8ff3e37670` |
| `zone_shift.csv` | 12,000 | `16c5da1a0007b86b98d3474e45715f8547a9228fd7cce369e42fb8ad374ae665` |
| `edge_cases.csv` | 5,118 | `2891c63336c190844ae4d90eb2a8f669a73ec015c3c3053c4d5f0bd3cfdfd909` |

All three have the same five documented columns: `incident_id`, `zone`, `priority`, `dispatched_at`, `on_scene_at`. [The full codebook](jingyao_synthetic/README.md) defines field meanings and units, offset-aware timestamps, America/New_York daily grouping, seed 5300, generation assumptions and scope, illustrative target, exact analysis settings, limitations, and who would record each field in a real dispatch system. Every primary row is explicitly synthetic; there are no patient records or external-data inputs to its generator.

## Checks executed for this acceptance

From the repository root:

```bash
ls data/jingyao_synthetic/*.csv
python data/jingyao_synthetic/verify.py
```

The listing printed exactly:

```text
data/jingyao_synthetic/edge_cases.csv
data/jingyao_synthetic/stable.csv
data/jingyao_synthetic/zone_shift.csv
```

The verification exited **0** and printed:

```text
PASS: all three CSVs reproduce byte for byte, seed 5300
PASS: 120 groups x 100 rows; positive durations; 08:00–20:00; identical 8000-row baselines; change scope A/P1 monitoring only
PASS: D1/D2/D3; target equality; +1 second; cutoff; midnight; duplicates; provisional 20/100
PASS: H-02 reproduction, core/API and edge checks complete. Browser acceptance is recorded separately in data/H02_ACCEPTANCE.md.
```

Its five full-response core/FastAPI TestClient comparisons also printed PASS: stable P1/P2, shifted P1/P2, and edge P1. Generation used a temporary directory and did not overwrite the input CSVs. Independent codebook review found no missing H-02 field, unit, scenario, provenance or collection note.

| Case | Overall total / usable / excluded | Formal signals with the documented usable baselines reviewed |
|---|---|---:|
| stable P1 | 12000 / 12000 / 0 | 0 |
| stable P2 | 12000 / 12000 / 0 | 0 |
| zone_shift P1 | 12000 / 12000 / 0 | 8, all high in A |
| zone_shift P2 | 12000 / 12000 / 0 | 0 |
| edge_cases P1 | 5118 / 5107 / 11 | 0 |

Regular files use target 10 minutes, baseline cutoff `2026-09-21T00:00:00-04:00`, and `as_of=2026-10-01T00:00:00-04:00`. Edge uses the same target/cutoff but `as_of=2026-10-01T12:00:00-04:00`; its current day is provisional. Edge selected-P1 coverage is 5117 total / 5107 usable / 10 excluded, plus one unassigned-priority row overall. No P2 category exists in that file.

## Existing end-to-end evidence

- Julian's [HTTP acceptance](../tests/fixtures/api/DATASET_ACCEPTANCE.md), merged in PR #2, covered all seven CSVs. The H-04 review independently repeated **37 live HTTP calls: 12 successful combinations plus one expected rejection**, with unchanged data.
- Pingchuan's [browser acceptance](../app/frontend/acceptance/README.md), committed at `3db4409`, contains scripts, logs and screenshots: **110/110 dataset checks** over all seven CSVs and **70/70 known-answer handoff checks**. Jingyao's three files account for five of the dataset runs, including both priorities in each regular file.
- [H-04 final acceptance](../tests/fixtures/api/H04_CHECKIN.md), committed at `7d537af`, records those independently reviewed results, fresh backend/frontend checks and source continuity from the tested `e189c4b` application/data revision.

The complete browser runs were executed by Pingchuan and reviewed by Shifeng/Codex; no new full browser replay is claimed for this H-02 documentation check-in. Browser confirmation uses A/B for regular files and **EDGE only** for Jingyao edge. Other edge baselines intentionally remain unusable. CSV export comparisons normalize line endings and the final newline.

The original [VERIFICATION.txt](jingyao_synthetic/VERIFICATION.txt) is retained as historical evidence. Its old pending-browser sentence is superseded by the linked acceptance records. The revised verifier message points here without claiming to run browser tests itself. H-05 demonstration/recording, H-06 deployment and H-08 submission remain separate tasks.
