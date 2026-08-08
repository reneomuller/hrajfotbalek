---
name: letco-git-status
description: "Show the current git state in a compact summary. Use this BEFORE making"
---
<!-- letco:injected-skill begin slug="git-status" scope="system" definition-hash="d26242827a4518d3815afb5dbcd5a85a13c5612e76a5a578641d1fa5da131bc1" -->
<!-- The content below is materialised by Letco from a versioned pipeline skill.
     Edits to this file will be overwritten on the next session. Pipeline
     constraints in CLAUDE.md (letco:pipeline-constraints) take precedence. -->

# Git Status

<!-- type: script | version: 1.0.0 | scope: system -->

**Triggers:** `/git-status`, `/gst`

## Instructions

Show the current git state in a compact summary. Use this BEFORE making
decisions about what to change next, especially when:
  - You're not sure if previous changes were committed
  - You're picking up someone else's branch
  - You suspect uncommitted edits exist that you didn't make
  - You need to know if you're ahead/behind the remote before pushing

Run:
  - 'git status -sb'    → branch + tracking + short status (one line per file)
  - 'git log --oneline -10' → recent local commits
  - 'git diff --stat'   → summary of unstaged changes
  - 'git diff --cached --stat' → summary of staged changes

Report:
  - Current branch + tracking (e.g. 'feature/x → origin/feature/x [ahead 3]')
  - Untracked files (count + first 5 paths)
  - Staged + unstaged file lists with change type (M / A / D / R)
  - Most recent 5 commits (oneline)
  - If on a detached HEAD, say so prominently

Do NOT add / commit / push — this is a read-only orientation skill.

## Candidate commands (per stack)

These are hints — pick the one matching this project; or use Bash to run something else if the project uses a different convention.

```bash
git status -sb
git log --oneline -10
git diff --stat
git diff --cached --stat
```

<!-- letco:injected-skill end slug="git-status" -->
