---
name: letco-run-tests
description: "Run the project's test suite and report the result."
---
<!-- letco:injected-skill begin slug="run-tests" scope="system" definition-hash="7436412c33c704217c2e5716127923f91054df532ee834e488fb715f44b14f35" -->
<!-- The content below is materialised by Letco from a versioned pipeline skill.
     Edits to this file will be overwritten on the next session. Pipeline
     constraints in CLAUDE.md (letco:pipeline-constraints) take precedence. -->

# Run Tests

<!-- type: script | version: 1.1.0 | scope: system -->

**Triggers:** `/run-tests`

## Instructions

Run the project's test suite and report the result.

DETECT the stack from project files (in order of priority):
  - Makefile target 'test' → run 'make test' (project's own convention wins)
  - pnpm-lock.yaml → 'pnpm test' (or 'pnpm -r test' for monorepos)
  - bun.lockb → 'bun test'
  - yarn.lock → 'yarn test'
  - package-lock.json (Node) → 'npm test'
  - Cargo.toml → 'cargo test' (or 'cargo nextest run' if 'nextest' is in [tool.*])
  - go.mod → 'go test ./...'
  - pyproject.toml + pytest in [tool.poetry.group.dev.dependencies] or [project.optional-dependencies] → 'pytest'
  - pyproject.toml + Hatch / PDM → 'hatch run test' / 'pdm run test'
  - manage.py → 'python manage.py test' (Django)
  - pom.xml → 'mvn test'
  - build.gradle / build.gradle.kts → 'gradle test' (or './gradlew test')
  - *.sln / *.csproj → 'dotnet test'
  - Gemfile → 'bundle exec rspec' or 'bundle exec rake test'
  - mix.exs → 'mix test'

Run the detected command with output streamed. Exit code 0 = all pass.
On failure: report the FIRST 5 failing tests with file:line and assertion text.
Don't truncate the failure output until you've extracted at least the test name.
If no test runner is detected, output 'No test runner detected' and stop.

## Candidate commands (per stack)

These are hints — pick the one matching this project; or use Bash to run something else if the project uses a different convention.

```bash
bash -c make test
pnpm test
bash -c bun test
bash -c yarn test
bash -c npm test
bash -c cargo test
bash -c go test ./...
bash -c pytest
bash -c python manage.py test
bash -c mvn test
bash -c ./gradlew test
bash -c dotnet test
bash -c bundle exec rspec
bash -c mix test
```

<!-- letco:injected-skill end slug="run-tests" -->
