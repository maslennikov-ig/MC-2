# Career Playbook — the fourth arm, and what it did not fix

Run `2896e72f`, 2026-08-31, dev, against `88df445c3` — verified on the containers, not on CI.
Same role, language and wizard answers as the three arms before it, driven from code.

## Measured

| Measure                      | `d5137bc5` | `638ed691` | `88fc2368` |    `2896e72f` |
| ---------------------------- | ---------: | ---------: | ---------: | ------------: |
| judge criticals (deduped)    |         25 |          9 |          7 |        **11** |
| contract criticals, replayed |         12 |          7 |          3 |         **2** |
| block regenerations          |         30 |         25 |         19 |        **19** |
| wall clock                   |     24m09s |     20m26s |     12m57s |    **21m48s** |
| cost                         |  $0.104331 |  $0.107929 |  $0.089506 | **$0.115678** |

The replayed row is the comparable one: same code over four stored documents. The judge row is
not. Four runs of identical input have produced 25, 9, 7 and 11 criticals, and the swing between
the last two is inside that spread — this run is not evidence that anything regressed, and the
previous run was not evidence that anything was fixed.

Semantic repetition at the fixed 0.85 threshold: **1 of 471** audience-view pairs and **0 of
1,092** intra-block pairs (`docs/career-playbook/2026-08-31-semantic-repetition-2896e72f.md`).
One real pair again — `block_7` ↔ `block_12`, cosine 0.8762 — found, not repaired in two
attempts, recorded rather than aborted on.

## Verified live, not by replay

The calibration table changes are visible in the published document:

- **one** "Calibrate before publishing" heading, where run `88fc2368` printed two.
- **nine** rows carrying "assumed threshold, not company data", where the previous table listed
  29 values and not one threshold.

## What the run did not fix

- **The Role Canvas still contradicts the onboarding plan** (`mc2-i6l0i`). It promises "By Week 4:
  first forecast submitted" against a plan whose first forecast input is Week 2. The digest now
  carries the published steps and milestones, and something did change: the judge filed this as a
  critical, where in run `88fc2368` the identical class of defect was caught by nothing at all and
  I only found it by reading. Visible is not fixed. The issue stays open.
- **The judge filed a self-declared non-issue again.** Its block-25 critical ends "no defect is
  established here" — the `mc2-1mr7r` shape, which the 028 batch was supposed to close.
- **Two blocks invented a cadence the ledger does not hold** (`block_15` quarterly career
  conversation, `block_17` quarterly stay interview). Both were warnings in the previous run and
  criticals in this one; the underlying behaviour is unchanged.

## Correctly caught, and real

- `block_16` (employee+manager) pointed at `block_21` (manager). The employee never receives it,
  and the deterministic check named it — this is the citation rule working under the new reading
  hierarchy, not a regression of it.
- `block_17` cited [S7] for figures that do not appear in the retrieved source.

Both are model errors the checks exist to catch. The run row is kept as the fourth A/B baseline.
