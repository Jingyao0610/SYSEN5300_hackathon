# H-05 walkthrough draft verification

Date: 2026-10-16, America/New_York. Source: H-04-accepted team commit
`7d537af7e1e93df5ed9390789791f2c9af3604c2`. Changes: demo documentation only.

The exact four-dataset Python command embedded in `demo/README.md` was extracted and executed
against an owned local Uvicorn API, using its documented settings. The process was stopped
after verification. Actual overall total/usable/excluded and formal signal counts:

| CSV | Total / usable / excluded | Signals |
|---|---|---|
| Jingyao stable | 12000 / 12000 / 0 | 0 |
| Jingyao zone_shift | 12000 / 12000 / 0 | 8 |
| Jingyao edge_cases | 5118 / 5107 / 11 | 0 |
| Hayden NYC | 26209 / 26209 / 0 | 8 |

Relative Markdown links resolve. NYC baseline and September 4 values were also checked against
`app.qc.analyze_response`: Brooklyn baseline 1134/5106, Queens 1254/3632;
Brooklyn September 4 n=286, late=85, rate=0.2972027972027972,
UCL=0.29582578934745174, status high.

The existing full HTTP/core comparison was rerun without modifying its report or data:

```text
python tests/fixtures/api/verify_datasets.py
PASS 12 successful combinations + 1 expected rejection; 37 live HTTP calls; 7 CSVs unchanged
```

Browser values in the walkthrough are attributed to Pingchuan's committed H-04 campaign
(110/110 dataset checks). This draft verification is not another browser replay, a recording,
a public deployment check, or Hayden's independent walkthrough acceptance. Recording-script
text was not available on team main at the stated base commit. Shifeng retains ledger ownership.
