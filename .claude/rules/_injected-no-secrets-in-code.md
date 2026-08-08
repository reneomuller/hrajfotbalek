<!-- letco:injected-rule begin slug="no-secrets-in-code" scope="system" content-hash="c0c872e76fdff3994595070a6e2d5adb71e2c1d688b77f10e60e5032c9b5a2d0" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# No secrets in source code

API keys, tokens, passwords, and other secrets MUST NOT appear in source files
or commit history.

## What's a secret?
- Cloud provider keys (AWS, GCP, Azure)
- Database credentials
- OAuth tokens, API keys (Stripe, OpenAI, GitHub, …)
- Private keys, certificates
- Webhook signing secrets

## Required pattern
- Read from environment variables: `process.env.X` / `os.environ["X"]` / equivalent
- Reference `.env.example` for documenting required variables
- Use a secrets manager in production (Vault, AWS Secrets Manager, GCP Secret Manager)

## Prohibited
- Hardcoded strings that look like keys (`sk_live_...`, `AIza...`, JWT-shaped strings)
- Committed `.env` files (gitignore them)
- Secrets in test fixtures (use placeholders)

<!-- letco:injected-rule end slug="no-secrets-in-code" -->