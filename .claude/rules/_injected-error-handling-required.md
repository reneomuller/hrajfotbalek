<!-- letco:injected-rule begin slug="error-handling-required" scope="system" content-hash="6368555c5e0e36eb580c14ddf7067b3e77f015115f6d27aa4bf5149aaf27815a" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Error handling on every async boundary

Every async operation that can fail MUST be handled — but **handled** does not
mean "wrapped in try/catch". Most code should let errors propagate to a
boundary that knows what to do with them.

## The hierarchy of "handling"
1. **Boundary handler** (Express error middleware, Hono error handler, Fastify
   onError, FastAPI exception handler, Axum middleware, Spring `@ControllerAdvice`,
   global unhandledRejection / panic recovery): translates errors to HTTP
   responses, exit codes, or NATS NACKs. Logs once, with full context.
2. **Domain catch** (in a service method): only when the function can do
   something meaningful — recover, retry, fall back, or **add domain context**
   before re-throwing (`throw new PaymentDeclinedError('...', { cause: err })`).
3. **No catch at all**: the default. Let it bubble to (1).

## When you DO need a try/catch:
- You have a meaningful recovery action (fallback value, retry, alternate path)
- You need to add context that the outer layer can't supply (`cause:` chain)
- You're at a process boundary that has no outer handler (top of a worker loop,
  background job runner, batch processor)
- You're cleaning up resources (`try { ... } finally { release() }` is fine
  even without a catch)

## Anti-amplifier — DON'T add try/catch when:
- The framework's error middleware will catch it (Express, NestJS, FastAPI, etc.)
- Your only "handling" is `logger.error(err); throw err` — let the boundary log
- You'd just rethrow with no added context — the original throw is better
- "Just to be safe" — empty caution wrappers add noise and hide real handlers

## Required
- Errors logged exactly once, at the boundary, with operation name + correlation id
- Errors translated to user-facing response only at the boundary (no stack
  traces leaked to clients)
- Never swallow errors silently (`catch {}` with no log + no rethrow)

## Anti-patterns
- `try { ... } catch (e) { throw e; }` — adds nothing, just noise
- `try { ... } catch (e) { logger.error(e); throw e; }` repeated at every layer
  — duplicate logs; let the boundary log
- Bare `promise.then(...)` without `.catch` (only OK with a global
  unhandledRejection handler that logs and exits / restarts)
- `catch {}` empty blocks
- `console.log(err)` only — no propagation, no rethrow

## Logging
Use the project's structured logger; never `console.error` in production code.
At the boundary, log: error name + message + cause chain + operation + request id.

<!-- letco:injected-rule end slug="error-handling-required" -->