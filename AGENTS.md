# Agent instructions

## Commit and push every file change

- Every time you create, modify, rename, or delete a file in this repository, immediately make a Git commit and push it to the configured remote before changing another file.
- Make one commit per file change, with a concise message describing what changed.
- Stage only the change you made. Do not include unrelated or pre-existing changes in the commit.
- Do not commit secrets, credentials, or files ignored by Git. If a change cannot be committed safely, explain the blocker to the user.
- If the commit cannot be pushed, explain the blocker to the user before changing another file.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
