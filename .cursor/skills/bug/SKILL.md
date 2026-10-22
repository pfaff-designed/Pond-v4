---
name: bug
description: File a GitHub issue for one bug and start the Pond bug cloud agent on it. Use only when the user invokes /bug.
disable-model-invocation: true
---

# File a bug

`/bug` files one GitHub issue on `pfaff-designed/Pond-v4` and starts the Pond bug cloud agent on that issue. The script does both. Do not call the GitHub or Anthropic APIs yourself, and do not read `.env.local`.

## Before running anything

The report needs all four:

- a short title
- what happened
- what was expected
- how to reproduce it

The text after `/bug` is the report. If any of the four is missing, ask once for the missing piece and stop. Do not guess, and do not run the script.

## Run the script once

From the repo root:

```bash
python3 scripts/file-bug.py --title "TITLE" <<'EOF'
## What happened

...

## Expected

...

## Reproduce

...
EOF
```

Use the user's words in the body. Do not add a second issue if you run it again.

## What to tell the user

The script prints three lines: `issue`, `session`, and `transcript`. Give the user the issue URL, the session id, and the transcript URL.

If the script prints `issue:` and then `session: failed`, the issue exists and the agent did not start. Show the issue URL and the error. Stop.
