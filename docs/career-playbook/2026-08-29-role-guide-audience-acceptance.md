# Role Guide audience and repetition acceptance

Date: 2026-08-29

Target: development

Accepted implementation: `bf7de071f`

This record contains aggregates only. The exact smoke playbook id and generated customer-facing
prose remain in the gitignored local smoke artifacts and are not copied into tracked documentation.

## Result

| Criterion                     | Evidence                                                                                                                                 | Result |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Three complete reader views   | Employee, manager and HR documents were assembled from the accepted exact playbook and read from start to finish                         | Pass   |
| No lost blocks                | View sizes are 20 / 20 / 14 stored blocks; their union is all 27 ids and equals the full stored set                                      | Pass   |
| Canonical repetition boundary | `do_not_repeat` and prior-block context are derived from the canonical topic/audience catalogue; model-provided values cannot widen them | Pass   |
| Semantic improvement          | At threshold 0.85, both measured rates fell to zero on the accepted exact dev playbook                                                   | Pass   |
| Cost evidence                 | The settled row contains 34 node-cost records, including two Jina `semanticRepetition` records with 49,026 input tokens and $0.0024513   | Pass   |
| Repository acceptance         | Local `pnpm type-check` and `pnpm test:unit` passed; CI and dev deployment passed on the accepted implementation                         | Pass   |

## Baseline versus accepted dev playbook

The baseline is a 14-playbook cohort; the final measurement intentionally evaluates the one exact
acceptance playbook. This is an acceptance comparison, not a claim that two equal cohorts were run.

| Unit                                              |           Baseline | Accepted dev playbook |                  Change |
| ------------------------------------------------- | -----------------: | --------------------: | ----------------------: |
| Audience-view block pairs at or above 0.85        |  8 / 6,594 (0.12%) |       0 / 471 (0.00%) | -0.12 percentage points |
| Paragraph pairs within one block at or above 0.85 | 18 / 6,829 (0.26%) |       0 / 375 (0.00%) | -0.26 percentage points |
| Maximum audience-view block similarity            |             0.8784 |                0.8316 |                 -0.0468 |
| Maximum within-block paragraph similarity         |             0.9456 |                0.8096 |                 -0.1360 |

The fixed final threshold was 0.85. It was selected from the baseline distribution before the
implementation was accepted and was not re-selected from the final playbook.

## Reader-view inspection

| View     | Stored blocks | Markdown bytes | Lines | Reading result                                                    |
| -------- | ------------: | -------------: | ----: | ----------------------------------------------------------------- |
| Employee |            20 |         64,116 |   690 | Complete role, operating, growth and working-guide narrative      |
| Manager  |            20 |         71,201 |   710 | Complete management, assurance, risk and implementation narrative |
| HR       |            14 |         47,343 |   496 | Complete hiring, capability, onboarding and governance narrative  |
| Full     |            27 |         94,878 |   968 | Exact match to persisted `final_markdown`                         |

All four documents were read from start to finish. Markdown fences are balanced, table rows are
terminated, and the raw-placeholder scan found no template or unfinished-work markers. References
from a reader view to a specialist block omitted by the section 3 audience map
are supplemental: the local section still states the rule or summary needed by that reader, and the
adjacent Full document remains available for the deeper material. No audience checkbox was changed.

Phase C was not needed. The manager view is the largest audience document and includes competencies,
motivation, red flags, the FMEA-style failure analysis, continuity protocol and implementation
checklist.

## Paid-run and cost record

The first dev generation passed the runner's structural checks but failed the separate exact-id
semantic acceptance: its final maximum was 0.8855. That exposed a real defect in the regeneration
window cap, so the playbook was not accepted. The defect was fixed and delivered; the owner then
explicitly authorized the required second paid dev generation. No third generation was run.

| Dev generation | Outcome                                   | Duration | Settled/recorded playbook cost |
| -------------- | ----------------------------------------- | -------: | -----------------------------: |
| First          | Rejected by exact semantic acceptance     |  32m 56s |                   $0.061542307 |
| Second         | Accepted, 27/27 blocks                    |  15m 16s |                   $0.073384245 |
| Combined       | One rejected plus one accepted generation |  48m 12s |                   $0.134926552 |

The accepted second row has zero unknown-cost attempts. Its final playbook cost comes from
`career_playbooks.cost_breakdown`, not `generation_trace`.

Jina measurement calls are separate from generation cost. The tracked baseline invocation cost
$0.029450; the final exact-id evaluation cost $0.002484. During the recovery sequence, the rejected
playbook's exact evaluation cost approximately $0.002437, and an unsupported `--help` invocation of
the evaluator unintentionally executed another read-only evaluation costing approximately $0.002520.
That invocation did not mutate a playbook or start another generation.

## Cleanup

After this document, the exact-id semantic report and the local smoke artifacts were complete,
cleanup deleted the exact playbook and job-status rows named by the run manifest. A read-only
follow-up returned 0 playbook rows and 0 job-status rows for those exact identifiers. The local
gitignored smoke artifacts are retained as the detailed editorial evidence. The manifest's
temporary auth-user and organization entries were deliberately not mutated because access changes
are outside this stage's allowed boundary.
