---
target: status component and page
total_score: 20
p0_count: 0
p1_count: 3
timestamp: 2026-08-08T12-53-54Z
slug: src-pages-globalstatus-jsx
---
## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 2 | No freshness indicator; zero activity resembles failure. |
| 2 | Match system / real world | 2 | Status, active, connections, and packages are under-defined. |
| 3 | User control and freedom | 2 | Filters can strand pagination; no reset-all action. |
| 4 | Consistency and standards | 2 | Airport activity and service health both use status terminology. |
| 5 | Error prevention | 2 | Partial API failure and inactive state are not kept distinct. |
| 6 | Recognition rather than recall | 2 | ICAO-only names, colour-only state, and icon-only sorting require inference. |
| 7 | Flexibility and efficiency | 2 | Useful filters exist, but activity sorting and direct airport actions do not. |
| 8 | Aesthetic and minimalist design | 3 | Clean and restrained, with some generic dashboard chrome and excess controls. |
| 9 | Error recovery | 1 | Homepage hides failure; full page has no retry or retained stale data. |
| 10 | Help and documentation | 2 | Site docs exist, but this surface has no contextual definitions. |
| **Total** | | **20/40** | **Acceptable - significant improvements needed.** |

## Anti-patterns verdict

The page does not look badly AI-generated, but it has mild generic-dashboard traits: repeated pinging status dots, uniform cards, icon-only view/sort controls, vague package pills, and copy that could belong to any monitoring product. Real airport and scenery data keeps it grounded.

The deterministic Impeccable scan returned zero findings for both target files. Current Web Interface Guidelines review found meaningful false negatives: `transition-all`, inaccessible colour-only state, dropdown labels that do not label the rendered triggers, icon-only pagination names on SVGs rather than buttons, an internal route using an external-link icon, and errors without recovery.

No detector overlay was injected. Independent agent browser discovery was unavailable, but the parent live-browser fallback successfully rendered `/status` at desktop and mobile sizes and confirmed the visible hierarchy and responsive truncation.

## Overall impression

The page is visually clean and mechanically understandable, but it is answering three questions at once: whether BARS infrastructure is healthy, which airports/scenery are supported, and where users are connected right now. The single biggest opportunity is to separate those concepts and make live inactivity feel neutral rather than broken.

## What is working

- Homepage preview to dedicated status page is sensible progressive disclosure.
- Search, filters, grid/list views, semantic table markup, loading skeletons, and reduced-motion handling form a solid technical base.
- Airport, controller, pilot, region, and scenery data can answer useful pilot questions once the labels are clarified.

## Priority issues

### P1 - Quiet activity is presented like an outage

Both surfaces make `0 Active Now` red. During review, four airports were supported and zero were active, so the normal live state looked unhealthy. Use neutral copy such as `No airports active right now`; reserve red for confirmed refresh/service failure. Add `Updated just now - refreshes every 15 seconds` and a separate service-status link.

Suggested command: `$impeccable clarify`

### P1 - Inactive, empty, stale, and failed are collapsed together

The homepage logs failures only; the full page replaces data with a raw error and no retry; filter no-results render blank; page number is not reset after filters. Model fresh, stale, unavailable, inactive, and no-results separately. Retain last-known data, add retry/reset actions, and clamp pagination.

Suggested command: `$impeccable harden`

### P1 - The page purpose and vocabulary are ambiguous

`Global BARS Status` suggests infrastructure health, while this page primarily shows live airport usage and supported scenery. Rename it `Live airport activity` or `BARS network activity`; describe it as `See where pilots and controllers are currently connected to BARS`; rename `Packages` to `Supported scenery`.

Suggested command: `$impeccable clarify`

### P2 - Cards require too much domain inference

Cards show ICAO and an inferred continent, but no airport name, explicit active/inactive label, or next action. Package chips turn green with live activity even though scenery support is static. Add airport name/city when data permits, visible state text, neutral scenery chips, and either show the already-computed light count or remove that unused computation.

Suggested command: `$impeccable layout`

### P2 - Controls are heavier than the current dataset and underspecified

Four airports currently receive search, two filters, three icon controls, two views, sorting, and pagination architecture. Sort direction is invisible; list view collapses controller and pilot counts; mobile truncates the continent filter. Keep a strong default view, label sorting, show result count, preserve controller/pilot columns, and make secondary controls responsive.

Suggested command: `$impeccable distill`

## Persona red flags

- First-time pilot: may interpret red zero as downtime, may not recognize bare ICAOs, and cannot tell whether `Default` is scenery compatibility or a live state.
- Power user/controller: no last-updated time, activity sort, stale indicator, light activity, or airport deep link; list view removes the controller/pilot distinction.
- Airport contributor: supported scenery is visible, but there is no contribution path when an airport or package is absent.

## Minor observations

- Remove the exclamation mark from operational copy.
- Rename the homepage CTA to `View all airport activity` and use a chevron, not an external-link icon.
- Count active supported airports, not every live-state airport, so the headline and visible cards cannot disagree.
- Add `Other` to the region filter or replace first-character continent inference with airport metadata.
- Put pagination accessible names on the buttons, associate labels with dropdown triggers, use a search input with `name`, and replace `...` with `…`.
- One static state dot plus visible text would feel calmer and more trustworthy than three animation layers.

## Questions to consider

- Is the primary job service health, supported-airport discovery, or live activity?
- If zero live airports is normal, should supported coverage be the primary metric?
- What action should a pilot take after reading a card?
- Would a supported-airport directory with a small live overlay better match the enduring value of the data?
