<!-- letco:injected-rule begin slug="no-console-log" scope="system" content-hash="57a3a742cad14bd9c3fffabe62a86ecd02ac598c4a18c1c62623f17d289428c8" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# No console.log in production code

`console.log`, `console.warn`, `console.error`, and `print` calls in
production code paths must be replaced with structured logging.

## Why
- Loggers add levels, formatting, and correlation IDs
- Production observability requires JSON output
- console.log goes to stdout with no filtering

## Use the project logger
- Node: pino / winston / project-specific
- Python: structlog / standard logging
- Go: zap / zerolog
- Rust: tracing

## Exceptions
- CLI tool's *user-facing output* (the actual program output, not diagnostic logs)
- Build/dev scripts under `scripts/` or `tools/`

<!-- letco:injected-rule end slug="no-console-log" -->