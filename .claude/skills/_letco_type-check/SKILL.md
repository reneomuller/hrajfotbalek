---
name: letco-type-check
description: "Run the project's static type-checker and report errors. This catches the"
---
<!-- letco:injected-skill begin slug="type-check" scope="system" definition-hash="bcd7b2a0a7e04c49214adb88601cff6720dd92d8ef501a4b7ba3c1efcaa9698c" -->
<!-- The content below is materialised by Letco from a versioned pipeline skill.
     Edits to this file will be overwritten on the next session. Pipeline
     constraints in CLAUDE.md (letco:pipeline-constraints) take precedence. -->

# Type Check

<!-- type: script | version: 1.0.0 | scope: system -->

**Triggers:** `/type-check`, `/typecheck`

## Instructions

Run the project's static type-checker and report errors. This catches the
majority of AI-introduced bugs (missing fields, wrong arity, drift between
interfaces and implementations) faster than tests do.

DETECT the type-checker:
  - tsconfig.json → 'npx tsc --noEmit' (or with -p for monorepos)
  - For projects with a 'typecheck' npm script → 'pnpm typecheck' / 'npm run typecheck'
  - pyproject.toml [tool.mypy] / mypy.ini → 'mypy <pkg>'
  - pyrightconfig.json / pyproject.toml [tool.pyright] → 'pyright'
  - Cargo.toml → 'cargo check --all-targets' (faster than 'cargo build' for type errors)
  - go.mod → 'go vet ./...' (and 'go build ./...' if vet alone isn't enough)
  - pom.xml → 'mvn compile'
  - build.gradle → './gradlew compileKotlin' / './gradlew compileJava'
  - .csproj → 'dotnet build --no-restore'
  - Sorbet (Ruby) → 'srb tc'

Report:
  - Total error count
  - For each error: file:line:column, error code, message
  - For TS: distinguish errors in YOUR code from errors in node_modules / generated
    files (the latter are usually upstream issues, not yours)

Do NOT auto-fix; type errors require careful, contextual fixes.
Use this skill alongside /run-tests; tests catch behavior, type-check catches
shape — both are needed.

## Candidate commands (per stack)

These are hints — pick the one matching this project; or use Bash to run something else if the project uses a different convention.

```bash
pnpm typecheck
bash -c npm run typecheck
npx tsc --noEmit
bash -c mypy .
bash -c pyright
bash -c cargo check --all-targets
bash -c go vet ./... && go build ./...
bash -c mvn compile
bash -c ./gradlew compileKotlin compileJava 2>/dev/null || gradle compileKotlin compileJava
bash -c dotnet build --no-restore
```

<!-- letco:injected-skill end slug="type-check" -->
