<!-- letco:injected-rule begin slug="readme-updates" scope="system" content-hash="83e5a4b2152a9afde958b6da5ca8bf586106c6036471b457b2bd57ff14988439" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# README reflects current state

The project README MUST be updated when:

- New CLI command / flag is added → update Usage
- Required environment variable is added → update Setup
- Build/run command changes → update Quickstart
- New external dependency (DB, queue, …) → update Prerequisites
- API surface changes (for libraries) → update Examples

## What's NOT a README change
- Internal refactors with no observable change
- Performance fixes (mention in changelog instead)
- Bug fixes (changelog)

## Minimum README sections
1. One-paragraph what-is-this
2. Quickstart (`git clone` → running locally)
3. Configuration (env vars, secrets)
4. Common commands (test, build, deploy)
5. Architecture overview (diagram or 3–5 paragraphs)
6. Contributing (or link to CONTRIBUTING.md)

<!-- letco:injected-rule end slug="readme-updates" -->