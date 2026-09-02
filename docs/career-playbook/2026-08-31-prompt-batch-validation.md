# Career Playbook — the paid run that validates the 028 prompt batch

Run `88fc2368`, 2026-08-31, dev. `Sales Manager B2B` / en, the runner's own English smoke
fixture, driven from code: the session is minted with `auth.admin.generateLink` and redeemed
with `verifyOtp`, so no browser and no owner click was involved. Deploy verified on the
containers, not on CI: `megacampus-api-dev` and `megacampus-worker-dev` both report
`org.opencontainers.image.revision 64ae37652953b109a7f493377a53a5c67a259723`, the tip of
`develop`.

Same role, same language and the same wizard answers as `d5137bc5` and `638ed691`, so the
three are one A/B with three arms.

## What the run measured

| Measure                         | `d5137bc5` | `638ed691` |    `88fc2368` |
| ------------------------------- | ---------: | ---------: | ------------: |
| judge criticals (deduped)       |         25 |          9 |         **7** |
| block regenerations             |         30 |         25 |        **19** |
| wall clock                      |     24m09s |     20m26s |    **12m57s** |
| cost                            |  $0.104331 |  $0.107929 | **$0.089506** |
| cost rows naming a service tier |          0 |         12 |            10 |

Counted the same way for all three: `severity = critical` in `q_a_data.quality_issues`, and
the sum of `cost_breakdown.regeneration_attempts`.

Semantic repetition, measured against the fixed 0.85 threshold with
`measure-playbook-repetition.ts --mode evaluation`:
`docs/career-playbook/2026-08-31-semantic-repetition-88fc2368.md`. **2 of 471** audience-view
pairs and **0 of 747** intra-block pairs. The two are one real pair counted in the two views
that hold it — `block_1` (Mission and key results) ↔ `block_6` (KPI and metrics), cosine
0.8665. The pipeline found it, spent both remediation attempts on it, and shipped the
playbook with the claim recorded in `generation_warnings`, which is the behaviour accepted on
2026-08-30: measured-and-unrepaired degrades, it does not abort.

## What it proves, per issue

- **`mc2-9d2ji`** — no judge critical in this run pairs two blocks with no shared reader. The
  two repetition criticals name their shared view explicitly. Validated.
- **`mc2-923ku`** — `block_12`, the HR-only block that lost 13 of its 26 constraint pairs to
  the audience filter, took **zero** regenerations and produced no contradiction. Validated.
- **`mc2-eksyp`** — the 22.5-entry `do_not_repeat` list is measured, not settled. One arm
  cannot answer whether a shorter list would do better; the product question needs the second
  arm the issue describes. Stays open with this measurement attached.

## What the run found

Replaying the deterministic contract checks over the stored blocks of all three runs — same
code, three documents — gave 12, 7 and 3 criticals. Two of the three in `88fc2368` attacked
correct text, and each had already cost two regenerations:

- `validateUnsourcedStatistics` asked block 18 to cite a source for the ledger's own
  `Forecast accuracy` target, because the sentence restated the label across a clause and
  happened to contain the word "market" — inside the phrase denying the number is a market
  figure.
- `validateCadenceConsistency` read "daily" out of "(pipeline and forecast reviews, daily
  triage, coaching, forecast submission, CRM configuration)" as the forecast review's rhythm.

Both are fixed in `4ec3bf1f7`, each test proven red against the pre-change source. Replayed
with the fix the same three documents give 9, 3 and 1; every cadence critical in `638ed691`
was the enumeration shape.

The surviving critical is real and is a content defect, not a checker defect: block 9 writes
"Gartner analysts cited in [S11] predict that by 2026, 65% of B2B sales organizations will
transition…", and S11 is a vendor blog (janek.com). The chain is stated honestly, but the
reader is still sent to a vendor page for an analyst prediction, and no primary research was
retrieved for this run.

## Not proven by this run

`metric_conflict` fell from 2 to 0 and cadence criticals from 4 to 1 between `638ed691` and
`88fc2368`, but no code changed between them that touches either. Both are generation
variance until a fix names them. `mc2-tub8q` and `mc2-s8xx6` stay open on that basis.

The run row is kept as the third A/B baseline and is not cleaned up.
