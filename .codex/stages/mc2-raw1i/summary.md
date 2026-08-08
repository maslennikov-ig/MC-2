# Stage `mc2-raw1i` — reachable empty-section guard

Active stage id: `mc2-raw1i`
Status: in progress.

## Scope

Make the existing Stage 6 `emptySections` guard reachable by counting actual H2 content-section
headers instead of non-empty fragments returned by `String.split()`. Preserve exact H2 counts and
leave generation, scoring, database, and live processing outside this stage.
