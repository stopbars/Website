# Explain and configure React Doctor rules

Use this workflow when the user wants to understand or configure a diagnostic,
not when fixing the underlying code.

1. Identify the full rule key from the diagnostic.
2. Explain it before changing configuration:

```bash
bunx react-doctor@latest rules explain react-doctor/no-array-index-as-key
```

3. Apply the narrowest control matching the user's intent.
4. Validate the result:

```bash
bunx react-doctor@latest --verbose --diff
```

## Commands

```bash
bunx react-doctor@latest rules list
bunx react-doctor@latest rules list --configured
bunx react-doctor@latest rules list --category Performance
bunx react-doctor@latest rules explain <rule>
bunx react-doctor@latest rules disable <rule>
bunx react-doctor@latest rules enable <rule>
bunx react-doctor@latest rules set <rule> warn
bunx react-doctor@latest rules category "React Native" off
bunx react-doctor@latest rules ignore-tag design
bunx react-doctor@latest rules unignore-tag design
```

## Choose the narrowest control

- One unwanted or false-positive rule: disable that rule.
- Correct rule with the wrong severity: set it to `warn` or `error`.
- Disabled-by-default rule that should run: enable it.
- Unwanted category: turn off that category.
- Noisy behavioral family: ignore its tag.
- Keep the diagnostic locally but exclude it from a PR, score, or CI gate: edit
  `surfaces` instead of disabling the rule.

Tag ignores are applied before rule and category overrides. For rules that are
not ignored by tag, rule settings override category settings, which override
defaults. Surface exclusions only change visibility; they do not stop a rule
from running.

Prefer explaining the rule's impact before offering to disable it. Do not
suppress a diagnostic without checking its code context and confirming why it
does not apply.
