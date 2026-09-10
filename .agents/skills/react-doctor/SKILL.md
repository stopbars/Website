---
name: react-doctor
description: "Run or interpret React Doctor when requested or when a diagnosed React issue warrants it. Do not run automatically after routine React edits."
---

# React Doctor

Use diagnostics to investigate the requested issue. Choose validation based on
the change; a routine React edit does not require a React Doctor run.

## Targeted diagnostics

When a scan is warranted, start with the changed scope:

```bash
bunx react-doctor@latest --verbose --scope changed
```

Confirm findings against the code and fix issues introduced by the requested
change. For a requested score comparison, record the baseline and use the same
tool version and scope for both runs. Do not infer a regression from a lone score.

## General cleanup

For a requested full audit or a problem requiring repository-wide analysis, run:

```bash
bunx react-doctor@latest --verbose
```

Treat diagnostics as hypotheses. Read the affected code, confirm the root
cause, and prioritize errors before warnings. Keep unrelated or risky fixes in
separate branches.

## Full triage

When the user requests `/doctor`, a full React Doctor run, or a cleanup pass,
fetch and follow the current canonical playbook:

```bash
curl --fail --silent --show-error \
  --header 'Cache-Control: no-cache' \
  https://www.react.doctor/prompts/react-doctor-agent.md
```

Use per-rule prompts from
`https://www.react.doctor/prompts/rules/<plugin>/<rule>.md` when the playbook
calls for them. The workflow edits the working tree directly; do not commit or
open a pull request unless the user separately asks.

## Explain or configure rules

When the user asks why a rule fired or wants to tune diagnostics, read
[references/explain.md](references/explain.md) before changing configuration.
