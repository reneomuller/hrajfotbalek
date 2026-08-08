---
name: letco-run-lint
description: "Run the project's linter and report violations."
---
<!-- letco:injected-skill begin slug="run-lint" scope="system" definition-hash="4002365ee16a3d2fee953b8da0c8a9e465a1b97b07994476c7c9e1ee9240aa57" -->
<!-- The content below is materialised by Letco from a versioned pipeline skill.
     Edits to this file will be overwritten on the next session. Pipeline
     constraints in CLAUDE.md (letco:pipeline-constraints) take precedence. -->

# Run Linter

<!-- type: script | version: 1.1.0 | scope: system -->

**Triggers:** `/run-lint`, `/lint`

## Instructions

Run the project's linter and report violations.

DETECT the linter from config files (priority order):
  - Makefile target 'lint' → 'make lint' (project's own convention wins)
  - package.json with a 'lint' script → 'pnpm lint' / 'npm run lint'
  - Node + ESLint (eslint.config.* / .eslintrc.*) → 'npx eslint .'
  - Node + Biome (biome.json) → 'npx biome check'
  - Python + ruff (ruff.toml / pyproject.toml [tool.ruff]) → 'ruff check'
  - Python + flake8 → 'flake8'
  - Python + pylint → 'pylint <pkg>'
  - Go (.golangci.yml / .golangci.yaml) → 'golangci-lint run'
  - Rust (Cargo.toml + clippy.toml) → 'cargo clippy --all-targets -- -D warnings'
  - Ruby (.rubocop.yml) → 'bundle exec rubocop'
  - Kotlin (.editorconfig + ktlint) → 'ktlint'
  - Scala → 'scalafmt --check'
  - Java (Checkstyle / Spotless) → 'mvn checkstyle:check' / './gradlew spotlessCheck'

Report violations grouped by severity (error / warning / info) with file:line.
Do NOT auto-fix unless the user explicitly asks (use /format-code for that).
If multiple linters are present (e.g. ESLint + Biome), report what each found.

## Candidate commands (per stack)

These are hints — pick the one matching this project; or use Bash to run something else if the project uses a different convention.

```bash
bash -c make lint
pnpm lint
bash -c npm run lint
npx eslint .
npx biome check
bash -c ruff check
bash -c flake8
bash -c golangci-lint run
bash -c cargo clippy --all-targets -- -D warnings
bash -c bundle exec rubocop
```

<!-- letco:injected-skill end slug="run-lint" -->
