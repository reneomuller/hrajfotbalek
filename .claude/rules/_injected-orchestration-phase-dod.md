<!-- letco:injected-rule begin slug="orchestration-phase-dod" scope="system" content-hash="13caef00defe82f2c6eac08bfa665bb07f2e79186b39dedcfb18c4df9715473b" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Every phase has measurable Definition of Done

A phase / job / stage is **done** only when its DoD criteria pass — not when
the AI (or the runner) says so.

## Criteria must be
- **Objective** — pass/fail, no "looks good"
- **Testable** — verifiable by code, command, file inspection, or HTTP probe
- **Specific** — names a file, function, table, endpoint, or measurable outcome

## Good DoD examples
- "File `src/foo.ts` exports function `bar()` with signature matching the
  `Bar` interface"
- "Endpoint `POST /api/users` returns 201 with body matching
  `CreateUserResponseSchema`"
- "Test `User.create rejects duplicate email` exists and passes"
- "Migration adds column `users.email_verified_at` (timestamp, nullable)"
- "`pnpm test` exit code 0; `pnpm lint` exit code 0"

## Bad DoD examples (forbidden)
- "Feature works correctly"
- "Code is clean"
- "Tests are written"  ← which tests? what coverage?
- "Documentation is updated"  ← which docs? what content?

## Verification step
After phase completion, an automated DoD check re-reads each criterion against
the current state of the code / DB / running service. **Failed DoD must block
phase advancement.** No human-eyeball sign-off as a substitute.

<!-- letco:injected-rule end slug="orchestration-phase-dod" -->