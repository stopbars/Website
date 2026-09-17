---
name: react-grab
description: "Watch React Grab selections as a continuous task queue when explicitly requested. Do not use for a single pasted grab."
---

# React Grab

Use React Grab selections from the browser as a continuous task queue.

## Watch loop

Repeat until the user says stop:

1. Wait for the next grab:

```bash
bunx react-grab@latest pull --max-age 0
```

`--max-age 0` delivers every grab, including grabs made while another task was
in progress. If the command is interrupted, run it again; the watcher keeps its
queue.

2. Act on each JSON line returned.
3. Return to step 1.

## Handle newer grabs first

While working, check for a newer grab between steps:

```bash
bunx react-grab@latest pull --max-age 0 --wait 0
```

Empty output means continue. A new grab supersedes the current task: stop work
that has not been completed, terminate background processes started for it, and
act on the newest grab.

Run slow commands as background processes so the queue can still be checked.

## Act on a grab

Each grab has `content` with source references and may have a `prompt`:

- When `prompt` is present, treat it as the task and use the references in
  `content` to locate the source.
- When `prompt` is absent, follow the user's standing instruction. If none was
  provided, summarize the component and source location, then wait for direction.

## Stop

When the user says stop, run:

```bash
bunx react-grab@latest stop
```

Do not pull again after stopping. Run the watcher on the same machine as the
browser because it reads the local clipboard.
