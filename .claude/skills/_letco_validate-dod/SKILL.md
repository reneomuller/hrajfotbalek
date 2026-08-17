---
name: letco-validate-dod
description: "Re-read the Definition of Done for the current task. The DoD lives in whichever"
---
<!-- letco:injected-skill begin slug="validate-dod" scope="system" definition-hash="87f1aca8c6fe6ac849cce2827045e84c2f96ef174f019e31158a993617c16cfe" -->
<!-- The content below is materialised by Letco from a versioned pipeline skill.
     Edits to this file will be overwritten on the next session. Pipeline
     constraints in CLAUDE.md (letco:pipeline-constraints) take precedence. -->

# Validate DoD

<!-- type: slash_command | version: 1.1.0 | scope: system -->

**Triggers:** `/validate-dod`, `/dod`

## Instructions

Re-read the Definition of Done for the current task. The DoD lives in whichever
of these places the project uses: the task / ticket description, a phase / step
spec document, the PR description, an ADR, or — if the runtime exposes one — a
pipeline-context source. If multiple are present, prefer the most specific
(spec doc > ticket > PR description).

For each DoD criterion, verify it is satisfied in the CURRENT state of the
code (not what was claimed in a previous step). Concrete checks:
  - File exists / contains expected export / matches signature
  - Endpoint returns expected status + schema (issue a curl / fetch if the
    server is running locally)
  - Test exists with the named assertion (search the test files)
  - Migration file exists and has the expected operation
  - Lint / typecheck / tests pass (use the dedicated skills if available:
    /run-lint, /type-check, /run-tests)

Output exactly one of:
  - 'PASS — all N criteria satisfied' followed by a numbered list, OR
  - 'FAIL — M of N criteria not satisfied' followed by the failing criteria
    with file:line references and what is currently observed vs. expected.

Do not modify any files — this is a verification step only.

<!-- letco:injected-skill end slug="validate-dod" -->
