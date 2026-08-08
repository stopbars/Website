---
version: alpha
name: BARS Airfield Operations
description: A restrained dark design system for public, account, staff, and map-based BARS experiences.
colors:
  primary: "#3B82F6"
  canvas: "#09090B"
  surface: "#18181B"
  surface-raised: "#27272A"
  surface-hover: "#3F3F46"
  border: "#3F3F46"
  text-primary: "#FAFAFA"
  text-secondary: "#D4D4D8"
  text-muted: "#A1A1AA"
  text-subtle: "#71717A"
  accent-emphasis: "#60A5FA"
  accent-soft: "#1C2535"
  success: "#10B981"
  success-soft: "#172825"
  warning: "#F97316"
  warning-soft: "#2F211B"
  danger: "#F87171"
  danger-strong: "#DC2626"
  danger-soft: "#2E1C1F"
  focus: "rgb(96 165 250 / 0.78)"
  overlay: "rgb(0 0 0 / 0.70)"
typography:
  display-lg:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 4.5rem
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.025em
  display-sm:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.025em
  page-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 2.25rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.02em
  workspace-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.015em
  section-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.015em
  tool-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.015em
  body-lg:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.4
  data-micro:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: 0.6875rem
    fontWeight: 400
    lineHeight: 1
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  media: 24px
  full: 9999px
spacing:
  0: 0px
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  14: 56px
  16: 64px
  20: 80px
  24: 96px
  32: 128px
  page-inline: 24px
  content-standard-max: 1024px
  content-marketing-max: 1280px
  content-workspace-max: 1800px
components:
  button-primary:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.canvas}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.3}"
    height: "{spacing.12}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.3}"
    height: "{spacing.12}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.3}"
    height: "{spacing.12}"
  button-destructive:
    backgroundColor: "{colors.danger-strong}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.3}"
    height: "{spacing.12}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.6}"
  input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.3}"
    height: "{spacing.10}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.6}"
  navigation-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-emphasis}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.3}"
  badge:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "{spacing.2}"
  control-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.3}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  supporting-text:
    textColor: "{colors.text-muted}"
    typography: "{typography.body-sm}"
  metadata:
    textColor: "{colors.text-subtle}"
    typography: "{typography.caption}"
  link:
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
  status-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.md}"
    padding: "{spacing.4}"
  status-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.md}"
    padding: "{spacing.4}"
  status-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "{spacing.4}"
  focus-indicator:
    backgroundColor: "{colors.focus}"
    width: 2px
  modal-overlay:
    backgroundColor: "{colors.overlay}"
---

# BARS Website Design System

This file is the visual and interaction source of truth for the BARS website. Its purpose is to make new work feel like one product without forcing unrelated pages into one layout.

The frontmatter tokens are normative values. The prose explains when and why to use them. When an existing screen conflicts with this document, do not copy the inconsistency into new work. Preserve working behavior, follow this specification for new work, and migrate older surfaces deliberately when they are next changed.

The direction is intentionally based on the strongest existing BARS surfaces:

- **Account:** the standard for calm page hierarchy, grouped settings, card composition, and clear destructive boundaries.
- **Staff dashboard → User Management:** the standard for compact operational density, tool navigation, filters, repeated data, and responsive staff workspaces.
- **Home:** the standard for public-facing scale, generous negative space, strong typography, and restrained presentation.
- **Shared primitives:** `Button`, `Card`, `Dialog`, `Toast`, `Tooltip`, `Dropdown`, `PageLoading`, and `LoadingSkeleton` are the implementation baseline.

These references establish a shared language, not a set of layouts to copy verbatim.

## Overview

### Product character

BARS should feel like **night-time airfield operations translated into a modern interface**: dark, precise, quiet, and trustworthy. It is technical software for flight-simulation users, contributors, division staff, and BARS staff. The design must make complex work feel controlled without turning the product into a dense cockpit imitation.

The signature is **runway-light logic**. Most of the interface stays neutral. A small number of meaningful signals show the active path:

- blue identifies interaction, selection, and focus;
- emerald confirms a successful or available state;
- orange warns or marks a reversible high-attention action;
- red identifies destructive action, failure, or danger;
- everything else uses the zinc surface and text hierarchy.

This sparse use of color is what makes the interface feel operational. Do not add neon glows, decorative colored gradients, aviation gauges, fake radar decoration, or cockpit skeuomorphism.

### Experience principles

1. **One product, several page archetypes.** Uniformity comes from the same type, color, spacing, surface, state, and component rules. It does not require identical page composition.
2. **The page’s job determines its layout.** Marketing pages tell a story. Account pages group settings. Staff pages optimize scanning and action. Map editors give the canvas priority.
3. **Quiet by default, explicit when state changes.** Neutral surfaces carry content. Color, motion, and emphasis appear only when they communicate state or priority.
4. **Structure before decoration.** Use headings, alignment, spacing, and tonal grouping before adding borders, badges, icons, or shadows.
5. **Progressive disclosure for complex data.** Show the evidence needed for the next decision. Put source data, advanced configuration, and secondary detail behind a clear disclosure.
6. **Reuse before invention.** Extend an existing shared primitive or extract a repeated contract before creating another one-off version.
7. **No fake operational data.** Maps, positions, connections, status, and simulator-specific presentation must reflect real application state.

### Visual invariants

Every BARS page must preserve these constants unless an explicitly documented exception applies:

- zinc-950 page canvas and white-to-zinc text hierarchy;
- system sans typography, with monospace reserved for tokens, IDs, coordinates, and code-like values;
- 4 px micro-step and 8 px primary spacing rhythm;
- 8 px interactive corners and 12 px card/dialog corners;
- blue focus and selected states;
- one visually dominant primary action in a view or decision group;
- visible hover, focus-visible, active, disabled, loading, empty, error, and success states where applicable;
- Lucide outline icons using `currentColor`;
- sentence-case interface copy and verb-first actions.

## Colors

### Surface ladder

Use the surface ladder to create hierarchy without filling the page with borders or shadows.

- **Canvas — `#09090B`:** the page background, full-screen editor background, navbar base, and focus-ring offset surface.
- **Surface — `#18181B`:** cards, dialogs, menus, tool panels, popovers, and persistent navigation containers.
- **Raised surface — `#27272A`:** inputs, compact controls, active utility clusters, nested data panels, and hover backgrounds.
- **Hover surface — `#3F3F46`:** a short-lived interaction state, not a large resting background.
- **Border — `#3F3F46`:** structural boundaries. Prefer an alpha between roughly 50% and 75% for routine borders; use full strength for important separation.

Do not place raised surfaces directly on the canvas without a structural reason. The expected progression is canvas → surface → raised surface.

### Text hierarchy

- **Primary — `#FAFAFA`:** page titles, section titles, high-value data, selected navigation, and button text that requires maximum contrast.
- **Secondary — `#D4D4D8`:** ordinary content, control labels, and important supporting text.
- **Muted — `#A1A1AA`:** descriptions, metadata, helper text, and inactive navigation.
- **Subtle — `#71717A`:** timestamps, secondary metadata, placeholders, and low-priority labels. Do not use it for essential instructions.

Body text normally uses secondary or muted, not pure white. Pure white across every text level destroys hierarchy.

### Accent and status semantics

- **Blue:** interaction, selection, staff access, active navigation, focus, and links. Blue is not decoration.
- **Emerald:** successful completion, healthy status, copied state, or positive availability.
- **Orange:** warning, token regeneration, or an action that deserves attention but is not destructive.
- **Red:** errors, destructive operations, bans, deletion, and danger zones.

Never use the same hue for an unrelated decorative purpose. Never rely on color alone: pair state color with text, an icon, a selected control, or another persistent cue.

### Color emphasis rules

- Fill only the primary action. Secondary actions remain zinc or outline variants.
- Use soft tinted backgrounds at about 5–15% opacity and borders at about 10–30% opacity for status regions.
- Use full-strength status colors for small icons, short labels, and critical borders—not for entire page backgrounds.
- A danger zone may use a red-tinted surface, but its cancel or sign-out actions do not automatically become red-filled.
- Gradients are allowed for media placeholders, hero media, or subtle surface settling. They are not the default card treatment.
- Verify every foreground/background pair in its rendered state. Normal text must meet WCAG AA contrast; focus indicators must remain visible against every adjacent surface.

## Typography

### Typeface

Use the existing Tailwind/system sans stack: `ui-sans-serif, system-ui, sans-serif`. It is neutral, fast, and consistent with the approved pages. Do not introduce a display font to make one page feel “special.” A font change is a site-wide brand decision.

Use the platform monospace stack only for values people must inspect character by character:

- API tokens and keys;
- IDs and technical identifiers;
- coordinates;
- code or generated source;
- fixed-format examples.

Use tabular numerals for changing counts, timestamps, pagination, and dense data tables.

### Hierarchy

- **Marketing display:** `display-sm` on small screens and `display-lg` when the heading has enough width. Reserve it for a page thesis, normally Home.
- **Standard page title:** `page-title` for Account-style pages with a single narrow content column.
- **Workspace title:** `workspace-title` for Staff-style tools where density matters more than spectacle.
- **Section title:** `section-title` for major card or page sections.
- **Tool title:** `tool-title` for the active staff tool or a compact subsection.
- **Body:** `body-md`; use `body-lg` for short introductory text and `body-sm` for UI descriptions.
- **Labels:** `label-md`; use `caption` and `data-micro` only for genuinely secondary metadata.

The semantic heading outline and visual type role are separate decisions. Use one page-level `h1`, descend coherently, and style the element with the appropriate token.

### Text behavior

- Balance short headings with `text-wrap: balance`.
- Use `text-wrap: pretty` for short descriptions.
- Cap explanatory prose around 60–75 characters per line, normally `max-w-[65ch]`.
- Do not justify interface text.
- Allow text containers to grow. Avoid fixed heights when content can wrap or localize.
- Keep inputs at 16 px on mobile to prevent browser zoom; compact 14 px inputs are acceptable from the small breakpoint upward.
- Keep labels and badges on one line when splitting would change their meaning.
- If content is truncated, make the full value available through a tooltip, expansion, or detail view.

### Voice and copy

BARS copy is calm, direct, and technical without sounding bureaucratic.

- Use sentence case for headings, labels, buttons, and navigation.
- Begin buttons with a specific verb: “Save changes,” “Manage division,” “Regenerate token.”
- Keep the action name consistent through button, loading state, success state, and error state.
- Describe destinations in links; avoid “Click here” and repeated bare “Learn more.”
- Errors say what failed and how to recover. Avoid “Oops,” blame, and exclamation marks.
- Empty states explain what the space contains and provide one next action when an action is available.
- Placeholders show format examples; visible labels identify fields.
- Destructive confirmations repeat the consequence: “Delete account,” not “Yes.”

## Layout

### Spacing rhythm

Use a 4 px micro-step and an 8 px primary rhythm. Most deliberate spacing should come from the frontmatter scale.

- **4 px:** optical adjustment only.
- **8 px:** icon-to-label, label-to-helper, tightly related metadata.
- **12 px:** compact control groups and repeated dense rows.
- **16 px:** ordinary component gaps and compact inner padding.
- **24 px:** default card padding, tool padding, page gutters, and group separation.
- **32 px:** separation between major groups in a standard page.
- **48–64 px:** section separation in ordinary content.
- **80–128 px:** marketing rhythm and intentionally large narrative breaks.

The gap between groups must be visibly larger than the gap within a group. As a rule, use at least twice the within-group gap.

### Shared page shell

The standard site shell uses a fixed 80 px navbar, zinc-950 canvas, one visible `main`, and a footer. Page content receives 24 px inline padding. The navbar may use a translucent zinc-950 surface and backdrop blur after scrolling, with a structural zinc-800 border.

Use these container widths:

- **Standard/settings — 1024 px:** Account, settings, forms, and focused content.
- **Marketing — 1280 px:** Home and public narrative pages. Long text inside still receives a narrower reading measure.
- **Operational workspace — 1800 px:** Staff tools, review surfaces, large tables, and multi-pane workflows.
- **Full-screen canvas — viewport:** map/editor experiences where the canvas is the primary work surface.

Do not choose a wide container merely because space is available. Choose it because the task benefits from simultaneous information.

### Page archetype 1: marketing

Use for Home and public pages whose primary job is explanation or conversion.

```text
[ spacious thesis / primary action ]
[ wide product media or operational visual ]

[ focused section introduction ]
[ text                 media ]
[ media                text  ]
```

- Center the page thesis; keep supporting copy readable and concise.
- Use generous vertical space and a single dominant action pair.
- Alternate layouts only when the alternation improves the story.
- Use large radii only on media, not on every container.
- Marketing may be spacious; navigation, controls, dialogs, and status behavior still follow the application system.

### Page archetype 2: standard/settings

Use for Account-style pages, settings, details, and focused multi-section tasks.

```text
[ page title ]

[ optional role or context card ]
[ primary details card          ]
[ optional related-data card    ]
[ clearly separated danger zone ]
```

- Use the standard 1024 px container.
- Stack major cards with 32 px gaps.
- Card padding is 24 px on compact screens and 32 px when space allows.
- Each card begins with a concise title row; an icon may reinforce the domain but must not replace the title.
- Use nested tonal panels for related data. Do not turn every field into a separate floating card.
- Keep destructive content in a visibly bounded final section.

### Page archetype 3: operational workspace

Use for Staff-style dashboards and staff tools where scanning, filtering, and acting on data are the primary jobs.

```text
[ workspace title + context ]     [ utility cluster ]

[ grouped navigation ] [ active tool surface                    ]
[ 3 columns          ] [ 9 columns                              ]
                       [ tool title      count / filters / action ]
                       [ data grid, list, table, map, or editor   ]
```

- Use the 1800 px workspace container.
- On desktop, use a 12-column grid with a 3/9 navigation-to-content split unless the active tool needs a documented alternative.
- Keep the sidebar sticky when it improves wayfinding.
- On mobile, replace the sidebar with one clearly labelled dropdown or disclosure.
- The active tool owns one surface. Do not nest a new full dashboard shell inside it.
- Tool headers stack on narrow screens and place compact counts, filters, or the primary action on the trailing edge when space allows.
- Operational density may be compact, but controls remain distinct and usable.

### Page archetype 4: full-screen map/editor

Use only when a spatial canvas is the task—not merely a visual supplement.

```text
[ compact task chrome / status / primary action ]
[                                                     ]
[                    map or canvas                    ]
[                                                     ]
[ contextual panel or bottom sheet, only when needed ]
```

- Use `100dvh`; omit normal footer and page chrome when they compete with the task.
- Keep the map dominant. Put editing controls in stable chrome and secondary detail in contextual panels.
- Prefer progressive disclosure over permanent inspector clutter.
- Do not fabricate positions, geometry, connections, or preview state.
- On mobile, use sheets or collapsible panels without hiding the primary action or map context.

### Responsive behavior

- Break when the content stops fitting, not at an arbitrary device name.
- Preserve the expanded structure until it genuinely becomes cramped.
- Collapse multi-column layouts to one column; do not squeeze cards into unreadable widths.
- Full-width mobile actions remain inset by the 24 px page gutter.
- Let controls wrap in logical groups. Keep critical actions reachable in normal flow or stable task chrome.
- Test at 320 px reflow and 200% zoom without horizontal page scrolling.
- Use logical properties for directional spacing when writing custom CSS.

## Elevation & Depth

BARS is primarily a flat, tonal interface. Hierarchy comes from surface lightness, spacing, and structural borders.

### Default depth model

- Page canvas: zinc-950.
- Primary content: zinc-900 with a zinc-800 border.
- Nested controls or data regions: translucent zinc-800.
- Hover: a small lightness increase or border-strength increase.
- Selected: blue-soft background plus a blue border/text cue.

Cards do not need a shadow. If a border exists only to fake depth, prefer tonal separation.

### Overlay depth

Dialogs, menus, tooltips, and map popovers may use shadow because they physically overlap content.

- Dialog backdrop: 70% black with restrained blur.
- Dialog: zinc-900, zinc-800 border, soft large shadow.
- Popover: zinc-900, 1 px zinc-700 border, compact shadow.
- Tooltip: zinc-900, zinc-700 border, no dramatic shadow.

Do not combine a heavy border, heavy shadow, bright glow, and gradient on one surface.

### Motion

Motion confirms hierarchy or state; it does not decorate routine interactions.

- Ordinary hover/focus/color transitions: 150 ms ease-out.
- Dropdown and compact overlay transitions: about 150–200 ms.
- Route settle and dialog entrance: about 220–250 ms using a fast ease-out curve.
- Marketing reveal: about 480–500 ms, staggered only by meaningful content group.
- Button press: `scale(0.96)` when tactile feedback helps; no bounce.
- Specify transitioned properties. Never use `transition: all`.
- Do not animate high-frequency table scanning, typing, or selection beyond subtle color/opacity feedback.
- Under `prefers-reduced-motion`, remove translation and scale; preserve state with immediate or opacity-only feedback.

## Shapes

### Radius roles

- **4 px:** code chips, very small technical affordances, and tight inline shapes.
- **8 px:** buttons, inputs, navigation items, compact status regions, and nested panels.
- **12 px:** cards, dialogs, menus, toasts, and principal application surfaces.
- **16 px:** large media cards and unusually prominent grouped surfaces.
- **24 px:** hero media only.
- **Full:** badges, status dots, and avatars.

Nested corners must be concentric: the outer radius should approximately equal the inner radius plus the padding between them. Do not use the same large radius on nested parent and child surfaces.

### Borders

- Use 1 px structural borders.
- Prefer spacing over repeated separators.
- Use separators inside dense data cards only when they clarify zones such as identity, details, and timestamps.
- Dashed borders are reserved for empty/drop states, not ordinary cards.
- Selected and error borders must be paired with a second cue.

### Icons

- Use Lucide outline icons only unless a deliberate site-wide change is approved.
- Use `currentColor`; state changes come from CSS color and opacity.
- Use 16 px icons in controls and compact data rows, 20 px in medium controls, and 24 px in section headers.
- Match icon weight optically to adjacent text; do not mix icon libraries in one surface.
- Icon-only controls require an accessible name and at least a 40 × 40 px desktop target or 44 × 44 px touch target.
- Decorative icons use `aria-hidden="true"`.

## Components

### Reuse contract

Before creating a component, search `src/components/shared`. New pages must use or extend the existing shared `Button`, `Card`, `Dialog`, `Toast`, `Tooltip`, `Dropdown`, `PageLoading`, `LoadingSkeleton`, `Breadcrumb`, and `SimulatorBadge` where their contracts apply.

Use these ownership rules:

- A visual pattern used across routes belongs in `src/components/shared`.
- A pattern shared by multiple tools in one domain belongs at that domain’s component root.
- A composition used once stays local until its contract is understood.
- When a second implementation needs the same states and visual rules, extract it rather than copy class strings.
- Add a shared variant instead of overriding a primitive with a long chain of `!important` utilities.
- Do not create `NewButton`, `ModernCard`, or another parallel primitive to avoid extending the existing one.

The next reusable contracts to extract when touched in multiple places are `PageHeader`, `ToolHeader`, `StatusBanner`, `EmptyState`, `IconButton`, `SearchField`, `DataField`, and `WorkspaceShell`. Extraction should preserve behavior; do not add wrappers solely to satisfy these names.

### Buttons

Use the shared `Button` contract.

- **Primary:** white surface, zinc-950 text. The single strongest ordinary action.
- **Secondary:** zinc-700/800 fill, white text. A supporting action with clear affordance.
- **Outline:** translucent zinc surface, zinc border, secondary text. Low-emphasis actions, cancel, reveal, copy, and neutral utilities.
- **Destructive:** red-600 fill, white text. Reserved for the final destructive confirmation, not the button that merely opens the confirmation.

Sizes:

- compact: 40 px minimum height;
- standard: 48 px height with 24 px horizontal padding;
- hero: 56 px height with 40 px horizontal padding;
- icon-only: 40 px desktop, 44 px touch.

Every button has hover, focus-visible, active, disabled, and loading states. Keep its ordinary label visible in the loading phrase: “Saving changes…”, not “Loading…”. Buttons may grow or wrap for longer text; do not clip labels.

### Cards and grouped surfaces

Use `Card` for a meaningful content group, not every row.

- Default: zinc-900, zinc-800 border, 12 px radius, 24 px padding.
- Use 32 px padding for spacious standard/settings cards when the viewport allows.
- Hover borders are appropriate only when the card or its contents are interactive.
- A static card must not look clickable.
- Use inner zinc-900/50 or zinc-800/60 regions for grouped fields and summaries.
- Keep one alignment edge through title, description, fields, and actions.

### Page and tool headers

A page header contains one `h1`, an optional one-line description, and an optional trailing utility cluster. A tool header contains one `h2`, a concise description capped near 65 characters per line, and an optional count/filter/action group.

- Standard page titles are spacious and may use `page-title`.
- Workspace titles use `workspace-title`.
- Tool titles use `tool-title`.
- Do not insert an eyebrow, badge, icon, and subtitle unless each communicates distinct information.
- On mobile, stack the trailing controls below the text and let them use the available width.

### Forms and inputs

- Every control has a visible label.
- Place helper and error text immediately after the control.
- Default input: zinc-800/60, zinc-700 border, primary text, muted placeholder, 8 px radius.
- Hover strengthens the border; focus uses the blue focus token and a 2 px ring.
- Do not disable submit merely because a field is incomplete. Validate on submit, mark invalid fields, explain the fix, and focus the first invalid field.
- Use the correct native control and input type. Do not rebuild a select, checkbox, or radio when the native element satisfies the requirement.
- Never block paste.

### Search, filters, and utility clusters

- Search is a labelled input with a leading 16 px icon, not an icon-only mystery control.
- Counts use a neutral compact badge and tabular numerals.
- Group related utilities inside one zinc-900/70 container only when the grouping clarifies their shared scope.
- Place the primary filter or action at the trailing edge of the tool header on wide layouts and below it on narrow layouts.
- Reflect meaningful filter and tool selection in the URL when it supports return, sharing, or browser navigation.

### Navigation and tabs

- Global navigation stays neutral until hover or current-route state.
- Workspace navigation is grouped by real task category, with small muted category labels.
- Active workspace items use blue-soft background, blue border, blue text, and `aria-current="page"`.
- Inactive items use muted text and a transparent border to prevent layout shift.
- Use links for navigation and buttons for in-place state changes.
- Mobile workspace navigation becomes one labelled dropdown; it does not become a horizontal strip of clipped tabs.

### Data cards, lists, and tables

Choose the presentation by comparison need:

- use cards when each record has a small independent action set and mixed metadata;
- use a table when users compare the same fields across many records;
- use a definition-style field grid for a small number of read-only account facts;
- use a map when spatial relationships are the decision evidence.

Data presentation rules:

- identity comes first, actions on the trailing edge;
- metadata icons are muted and consistent in size;
- use separators only between true zones;
- preserve stable card heights only when it improves row scanning and content remains reachable;
- show the full value for important truncated data;
- use tabular numbers for counts and dates;
- destructive icon actions still need clear accessible names and tooltips where visual meaning is not obvious.

### Dialogs

Use the shared `Dialog` for confirmations and short focused workflows.

- Trap focus, make background content inert, close with Escape when safe, and restore focus to the trigger.
- Title and description must identify the consequence.
- Use semantic icon/status color only when it matches the dialog’s purpose.
- Keep the final destructive action red-filled; cancel stays outline.
- While a consequential request is running, prevent accidental backdrop/Escape dismissal.
- Confirmation phrases are appropriate for irreversible high-impact actions, not routine saves.
- Dialog content must fit within the dynamic viewport and scroll internally when required.

### Toasts and inline status

- Toasts confirm results that do not need to remain in the page layout.
- Use `role="status"` and polite announcements for routine success/info; use `role="alert"` only for urgent errors.
- Destructive/error notifications remain until dismissed. Do not hide recovery instructions after a short timer.
- Prefer an inline error next to the failing field or section when the error has a location.
- Toast titles should describe the result (“Account deleted”), not generic mood (“Success”), when a specific result is known.

### Tooltips

- Use a tooltip to reveal a truncated value or name an unfamiliar icon action.
- Do not hide required instructions in a tooltip.
- Tooltip content must be reachable by keyboard and not depend on hover alone.
- Keep content brief and cap width around 256 px.

### Badges and status indicators

- Use badges for compact categorical metadata: simulator, role, count, or stable status.
- Reuse `SimulatorBadge` and the shared simulator-presentation contract for simulator names and colors.
- Badges are neutral by default. Use semantic color only when the category already owns that meaning.
- Status dots always include nearby text or an accessible label.

### Loading, empty, error, and success states

- Use route-aware `PageLoading`/`LoadingSkeleton`; the skeleton should resemble the final page archetype.
- Skeleton motion is subtle and removed under reduced motion.
- Empty states orient the person, explain why the area is empty when helpful, and offer one next step if available.
- Search empty states name the query or filter and offer a way to clear it.
- Errors remain close to their scope and say how to recover.
- Success feedback should not rearrange the page unexpectedly.

### Map and editor controls

- Treat the map as content, not a decorative background.
- Controls float within safe inset margins and use the same surfaces, radii, focus, and icon rules as the rest of the site.
- Keep the primary task action in stable chrome.
- Advanced layers, raw XML, source diagnostics, and secondary evidence use progressive disclosure.
- Use distinct, documented colors for operational geometry. Do not borrow global action colors if that would create a second meaning.

### Interaction and accessibility baseline

- Prefer native semantic elements.
- Every flow must work with a keyboard.
- Use `:focus-visible` with a 2 px blue indicator and 2 px offset; never remove focus without a replacement.
- Use at least 40 × 40 px targets in desktop tools and aim for 44 × 44 px in touch layouts.
- Icon-only controls require descriptive accessible names.
- One visible `main` landmark and one page-level `h1` are the default.
- After client-side route changes, focus the new `h1` without scrolling it out of place.
- Modals trap and restore focus.
- Dynamic results and errors use the appropriate live-region semantics.
- The interface must reflow at 320 px and remain usable at 200% zoom.
- Respect `prefers-reduced-motion` globally.
- Do not block pinch zoom.

## Do's and Don'ts

### Do

- Do choose the page archetype from the page’s job before writing JSX.
- Do use the canvas → surface → raised-surface ladder.
- Do use blue for focus and active/selected state consistently.
- Do keep one strongest primary action per decision group.
- Do group with spacing before adding borders.
- Do align content and controls to shared edges.
- Do reuse shared primitives and extend their variants centrally.
- Do keep staff tools compact, scannable, and responsive.
- Do keep maps dominant when spatial review is the task.
- Do show concise decision evidence and disclose secondary/raw detail.
- Do design loading, empty, error, success, disabled, and permission-denied states with the main state.
- Do test long names, long email addresses, IDs, zero results, large counts, and translated-length text.
- Do preserve real simulator names and shared simulator presentation.

### Don't

- Don’t make every page a dashboard, card grid, or centered hero.
- Don’t make one page feel unique by introducing a new font, color palette, radius scale, or shadow language.
- Don’t place cards inside cards repeatedly; use one primary surface with grouped inner regions.
- Don’t use blue, red, orange, or green as decoration.
- Don’t put several filled colored actions in one view.
- Don’t copy long utility strings into a second component.
- Don’t use `transition: all`, bouncy motion, or repeated entrance animation on routine interactions.
- Don’t hide essential content in hover-only UI or truncate it without recovery.
- Don’t use placeholders as labels or color as the only state cue.
- Don’t disable a submit action before showing what must be fixed.
- Don’t fabricate map positions, operational status, connections, or placeholder data that appears real.
- Don’t expose raw XML, diagnostics, or configuration before the decision-relevant summary.

### New page checklist

Before implementation:

1. State the page’s audience and single primary job.
2. Choose marketing, standard/settings, operational workspace, or full-screen map/editor.
3. Identify the one primary action and the essential decision evidence.
4. Search shared components and adjacent domain components.
5. Map every color, type size, radius, and spacing value to this document.

Before completion:

1. Review the entire route flow, not only the new component.
2. Check heading hierarchy, shared edges, reading measure, and group spacing.
3. Walk hover, focus-visible, active, disabled, loading, empty, error, and success states.
4. Complete the flow with keyboard only.
5. Check 320 px reflow, ordinary mobile width, desktop, wide desktop, and 200% zoom.
6. Check reduced motion and long-content behavior.
7. Confirm that operational data is real and simulator presentation uses the shared contract.
8. Run the repository’s scoped lint/tests/build and visually verify authenticated pages when access is available.

### Exception policy

An exception is allowed when the task genuinely requires different behavior, not because a local one-off is faster. Document the reason next to the component or in the relevant feature documentation. Preserve the invariants that still apply: typography family, semantic colors, focus treatment, state completeness, and accessible interaction.

If a new requirement exposes a missing system rule, update `DESIGN.md` and the shared primitive together. Do not let repeated exceptions silently become the new design system.
