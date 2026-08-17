<!-- letco:injected-rule begin slug="orchestration-decomposition" scope="system" content-hash="9879cdf3f343da5733e036e10f12ed908b2c03f55df18108a87d7a119c81f033" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Decompose work into phases by data dependency

When breaking a multi-step task into independent units of work (phases / jobs /
stages — the name varies by orchestrator), let **data and file dependencies**
drive the sequential-vs-parallel decision, not intuition or fear.

## Sequential when one of these is true
- Phase B reads files that Phase A writes
- Phase B reads database rows that Phase A creates or updates
- Phase B's prompt / input requires Phase A's output document
- The same module / file is touched by multiple phases (write contention)

## Parallel when ALL of these are true
- Phases work on disjoint files / modules
- Phases produce independent outputs
- Phases read only stable, immutable inputs (existing schema, finished docs)
- The set of touched files / resources has zero overlap

## Required (every orchestrator)
- Every phase declares its **inputs and outputs** up-front (touched files,
  read DB tables, written documents) — name the field whatever your
  orchestrator uses (`affectedFiles`, `outputs`, `writes`)
- Every phase declares its **dependencies** on other phases (an empty list
  means independent)
- The orchestrator builds a DAG from dependencies; **cycles are an error**,
  not a warning
- Set a sensible cap on parallelism — over-parallelism starves each phase of
  context (memory, CPU, LLM tokens, file handles). Typical 2–4.

## Anti-patterns
- "Let's run them all in parallel" without checking which files / resources overlap
- Defaulting to sequential "just to be safe" — slow without reason
- **Hidden dependencies** — phase B silently relies on an effect that phase A
  produced (cache, env var, in-memory state) without declaring it as input

<!-- letco:injected-rule end slug="orchestration-decomposition" -->