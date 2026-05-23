# Career Playbook Role Source And Custom Answer Flow

Date: 2026-05-23
Beads: `mc2-db696.22`
Branch: `codex/career-playbook-authoritative-roles-flow`

## Problem

The previous role-title suggestion list was useful as a UI prototype, but it behaved like a source of truth. That is wrong for production: a generic Russian query such as `менеджер по продажам` should not resolve to only `Менеджер по продажам B2B`.

The wizard also had a separate `Свободный ответ` button near `Далее`. That button saved notes into a separate free-form channel instead of answering the current question, so it competed with the main flow and made the next action unclear.

## Source Decision

There is no open ready-made library that gives high-quality RU/EN occupation autocomplete as a drop-in dependency.

NPM/library check:

- `esco-js`, `jobtitles`, `job-title`, and `@occupation/onet` are not published in npm.
- `professions` is an old generic list of common job titles; it has no RU/EN taxonomy, source codes, or department mapping.
- `job-recognition` is for extracting job titles from English text, not for normalized autocomplete.
- `@vantigo-ai/bls-soc-map` is a recent US BLS/SOC mapping package, but its own package metadata says it covers 158 patterns across 30+ categories. That is too narrow for the MC2 constructor and does not solve Russian labels.
- Generic UI autocomplete packages such as Algolia Autocomplete can improve widgets, but they do not provide occupation data. The current UI already has a local combobox, so adding one would not solve the user's issue.

Use a source-aware local index instead:

- `okz` for Russian occupation classification structure when a machine-usable, licensing-cleared subset is prepared.
- `onet` for English occupation titles, alternate titles, and richer US occupation data.
- `esco` for EU multilingual occupations and occupation-skill links, especially English and EU languages.
- `mc2_overlay` for product-specific and modern business variants such as B2B/B2C sales manager, RevOps, and common SaaS titles.

Runtime should stay local for the constructor. Live taxonomy APIs should not block typing or make the wizard fragile.

## Source Notes

- ESCO is free to consult/download and exposes CSV/ODS/RDF plus web/local API, but it does not include Russian. The portal lists EU languages plus Arabic, Icelandic, Norwegian, and Ukrainian. ESCO is still the best open multilingual backbone for EU/EN occupation concepts.
  - https://esco.ec.europa.eu/en/about-esco
  - https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api
  - https://esco.ec.europa.eu/en/classification/occupation-main
- O\*NET has strong English occupation data, alternate titles, and downloadable database files under Creative Commons terms. It is US-focused and API use requires account/terms compliance.
  - https://www.onetcenter.org/database.html
  - https://services.onetcenter.org/about
  - https://services.onetcenter.org/reference/
- ISCO-08 is the global classification backbone from ILO. It is useful for codes and broad hierarchy, but its 436 unit groups are too coarse for product autocomplete by themselves.
  - https://isco.ilo.org/en/isco-08/
- Lightcast Titles/Occupations look strongest for commercial title normalization, but production use requires commercial access and Russian titles are not confirmed as an open capability.
  - https://lightcast.io/open-skills/access
  - https://docs.lightcast.io/lightcast-api/docs/api-access
- OKZ / OK 010-2014 is the official Russian occupation classifier and is active, but no official simple API/CSV with clear mass-reuse terms was found. It should be treated as a candidate import source after licensing and format checks.
  - https://www.gostinfo.ru/catalog/Details/?id=5617314
  - https://protect.gost.ru/document.aspx?control=23&id=201447

## UX Decision

The wizard should follow a `creatable` pattern:

- Every editable text question accepts manual input directly in the field.
- Choice questions expose `Другое` / `Other` inside the current question, with an inline input.
- Selecting `Другое` does not create a separate note; it saves the typed value as that question answer.
- The global `Свободный ответ` button is removed from the fixed and follow-up flows.

LazyWeb references pointed to the same pattern:

- Deel careers role discovery: searchable role cards and grouped role browsing.
- Calendly mobile onboarding: asks for role as a single in-flow step with concrete options.
- Asana onboarding: asks for primary role as a single-choice list, not as a separate notes dialog.
- CapCut onboarding: uses selectable role cards to personalize the flow.
- LinkedIn mobile job search: combines search input with curated job collections.

21st.dev combobox examples reinforced the same `creatable combobox` behavior. No external component is imported because the existing MC2 components already cover the needed interaction, and the problem is data quality plus flow logic rather than a missing widget.

## Immediate Implementation

This stage does not import a large taxonomy. It corrects the production behavior and data contract:

1. Rename the local role dataset source away from `curated` to `mc2_overlay`, with optional source references for known external matches.
2. Add a broad `Менеджер по продажам` entry above B2B variants.
3. Add B2C, retail, account, channel, and B2B variants so a generic sales manager query shows several plausible branches.
4. Infer `department = sales` from selected or typed sales role when department has not been answered yet.
5. Remove the global `Свободный ответ` controls.
6. Add localized `Другое` / `Other` inline custom values for single-choice and multi-choice questions.

## Explicit Defers

- Full OKZ/O\*NET/ESCO import pipeline and normalized `role_id` persistence.
- Lightcast integration until commercial access is approved.
- Backend schema for source metadata and confidence score.
