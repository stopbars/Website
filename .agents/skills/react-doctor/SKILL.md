---
name: react-doctor
description: Use after changing React code, when finishing a feature or bug fix, before committing React changes, or when the user asks to run, scan, triage, explain, configure, or clean up React Doctor diagnostics. Covers correctness, security, accessibility, performance, bundle size, and architecture.
---

# React Doctor

Use React Doctor as a regression gate and as a guided cleanup workflow.

## After React changes

Run:

```bash
bunx react-doctor@latest --verbose --scope changed
```

Check that the score did not regress. Investigate and fix newly introduced
issues before committing.

## General cleanup

Run the full scan:

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
