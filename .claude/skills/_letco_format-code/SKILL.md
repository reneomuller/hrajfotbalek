---
name: letco-format-code
description: "Run the project's formatter on the CHANGED files only — never on the whole repo."
---
<!-- letco:injected-skill begin slug="format-code" scope="system" definition-hash="c8d4aa84344be11078cea4f4d5bc5809265a8b5af446598e4ab43566e7da1918" -->
<!-- The content below is materialised by Letco from a versioned pipeline skill.
     Edits to this file will be overwritten on the next session. Pipeline
     constraints in CLAUDE.md (letco:pipeline-constraints) take precedence. -->

# Format Code

<!-- type: script | version: 1.1.0 | scope: system -->

**Triggers:** `/format-code`, `/format`

## Instructions

Run the project's formatter on the CHANGED files only — never on the whole repo.
Reformat-everywhere creates a giant cosmetic commit that bulldozes other people's
in-flight changes; only touch what this work is touching.

GET the changed file list — combine all three sources, then dedupe:
  - Staged:   'git diff --cached --name-only --diff-filter=ACMR'
  - Unstaged: 'git diff --name-only --diff-filter=ACMR'
  - Untracked: 'git ls-files --others --exclude-standard'
  Pipe through 'sort -u' to deduplicate. AI-driven workflows usually have
  unstaged or untracked edits (the AI hasn't run 'git add' yet), so reading
  only the staged set silently no-ops. The supplied commands cover all three.
  Filter by extension to match the formatter (.ts/.tsx/.js/.json/.md for
  Prettier; .py for Black/ruff; .rs for rustfmt; .go for gofmt; ...)

DETECT the formatter from config files:
  - .prettierrc / .prettierrc.* / package.json 'prettier' → 'npx prettier --write <files>'
  - biome.json / biome.jsonc → 'npx biome format --write <files>'
  - dprint.json → 'npx dprint fmt <files>'
  - pyproject.toml [tool.black] → 'black <files>'
  - pyproject.toml [tool.ruff.format] → 'ruff format <files>'
  - rustfmt.toml or default Rust → 'cargo fmt -- <files>'
  - Go (default) → 'gofmt -w <files>' or 'goimports -w <files>'
  - .editorconfig + .swiftformat → 'swiftformat <files>'
  - ktlint.yml / Kotlin → 'ktlint -F <files>'
  - Java + Spotless → './gradlew spotlessApply' (whole-project; OK because
    Spotless internally limits to its configured globs)

After formatting:
  - Report: number of files changed, by extension
  - Recommend committing format-only changes as a SEPARATE commit (don't mix
    with semantic changes — keeps git blame readable)

Don't run the formatter if there are no changed files of the right extension.

## Candidate commands (per stack)

These are hints — pick the one matching this project; or use Bash to run something else if the project uses a different convention.

```bash
bash -c FILES=$( { git diff --cached --name-only --diff-filter=ACMR; git diff --name-only --diff-filter=ACMR; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml|css|scss)$' | tr '\n' ' '); [ -n "$FILES" ] && npx prettier --write $FILES || echo 'No matching files for Prettier'
bash -c FILES=$( { git diff --cached --name-only --diff-filter=ACMR; git diff --name-only --diff-filter=ACMR; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.(ts|tsx|js|jsx|json)$' | tr '\n' ' '); [ -n "$FILES" ] && npx biome format --write $FILES || echo 'No matching files for Biome'
bash -c FILES=$( { git diff --cached --name-only --diff-filter=ACMR; git diff --name-only --diff-filter=ACMR; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.py$' | tr '\n' ' '); [ -n "$FILES" ] && black $FILES || echo 'No matching Python files'
bash -c FILES=$( { git diff --cached --name-only --diff-filter=ACMR; git diff --name-only --diff-filter=ACMR; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.py$' | tr '\n' ' '); [ -n "$FILES" ] && ruff format $FILES || echo 'No matching Python files'
bash -c FILES=$( { git diff --cached --name-only --diff-filter=ACMR; git diff --name-only --diff-filter=ACMR; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.rs$' | tr '\n' ' '); [ -n "$FILES" ] && rustfmt $FILES || echo 'No matching Rust files'
bash -c FILES=$( { git diff --cached --name-only --diff-filter=ACMR; git diff --name-only --diff-filter=ACMR; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.go$' | tr '\n' ' '); [ -n "$FILES" ] && gofmt -w $FILES || echo 'No matching Go files'
```

<!-- letco:injected-skill end slug="format-code" -->
