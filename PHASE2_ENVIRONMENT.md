# Phase 2 — Stage 4: Environment preparation

**Verified on:** 2026-07-28, on this machine, by running each command.
**Blocks:** every phase in `EXECUTION_PLAN_PHASE2.md` carrying an E2E criterion.

Nothing in this document is inferred. Where something is absent it is written
as an install step for Oliver, never worked around.

---

## 1. The environment item that comes first

**REQ-ENV-001 — a seeded non-production database.** Until it exists:

- `npm run test:e2e` cannot run **anywhere**. The suite signs in with
  `signInWithPassword` against the seeded users in `scripts/fixtures.ts`, and
  those users were purged from production on 2026-07-28.
- The §8 screenshot-strip loop has no target.
- Phases 11 and 20 cannot start, and every phase before them ships without the
  regression net that proves it did not break Phase 1.

`.env.local` currently points **every tool in this repo, Playwright included, at
production**. That is the state to end.

### E1 — ruled: option A, the local Supabase stack

**Decided 2026-07-28.** Docker Desktop is installed and running (Oliver
confirmed; not independently verified by a session — `docker --version` was
absent from the shell PATH when this document was first written, which is the
state that prompted the decision).

The reason A won: option B — a second hosted project — puts a production-shaped
credential in reach of a test runner whose entire job is to create and destroy
data. This project has already had one incident where seeded accounts with a
committed password lived in production. Offline resets in seconds are a bonus;
isolation was the argument.

What A gives us, concretely:

| | Local stack |
|---|---|
| Reset cost | seconds (`npx supabase db reset`) |
| Runs offline | yes |
| Auth email in tests | captured by Inbucket on port 54324 — nothing leaves the machine, and no Supabase auth rate limit applies |
| Storage (Phase 7) | local emulation, same policy surface |
| Fidelity | high, **conditional on the Postgres major matching** — see §3 |
| Risk to production | none, once §0.2 of the plan's Phase 0 lands |

`supabase --version` already resolves to **2.109.1** (a devDependency), so the
CLI itself needs no install.

**The one thing A does not give us for free.** `playwright.config.ts` reads
`.env.local` by literal filename and throws if it is missing — and that file
holds production credentials. Until Phase 0 §0.2 teaches the tooling to prefer
`.env.test.local` and to refuse a production URL outright, "point the suite at
the local stack" and "overwrite the production credentials" are the same
action. That guard is written into Phase 0 as an acceptance criterion with a
unit test behind it, not as advice.

---

## 2. Toolchain, as measured

| Tool | This machine | Verdict |
|---|---|---|
| macOS | 15.6.1 (24G90), **arm64** | fine |
| Node | **v24.16.0** | fine — supports `--env-file` and TS type-stripping, both used by repo scripts |
| npm | 11.13.0 | fine |
| git | 2.39.5 (Apple Git-154) | fine |
| Supabase CLI | 2.109.1 (devDependency) | fine |
| Playwright | 1.61.1, browsers `chromium-1228`, `chromium_headless_shell-1228`, `ffmpeg-1011` installed | fine — the suite runs one project, `devices["Pixel 7"]`, which is Chromium; Firefox and WebKit are not needed and not installed |
| Vercel CLI | 54.9.1 | fine |
| Docker Desktop | **29.6.2** (server 29.6.2, aarch64, 8 GB allocated) | verified at Phase 0 |
| Podman / Colima | absent | not needed |
| `gh` (GitHub CLI) | **absent** | optional; only affects PR creation from the terminal |
| `psql` | absent | not required — `scripts/apply-migration.mjs` and `supabase/tests/run.mjs` both use the `pg` package for exactly this reason |
| Disk free | 220 GiB measured before the image pull | ample; the stack's images run 3–4 GB |
| Production Postgres | **17.6** | see §3 |

### Version pinning — a gap, not a failure

There is **no `engines` field in `package.json`, no `.nvmrc`, no
`.node-version`**. Nothing stops a future session or a new machine running a
different Node major against scripts that rely on `--env-file` and TS
type-stripping. This is worth fixing, but it is a repo change outside the frozen
scope — **it goes to `POLISH.md`**, and the pinned versions live in the table
above in the meantime.

---

## 3. Facts that change how migrations are written

- **Production Postgres is 17.6, and the local stack is 17.6.** Verified at
  Phase 0: `config.toml` already pins `major_version = 17` (line 42 — an earlier
  draft of this document said the key was absent, which was a truncated grep
  rather than a missing key). `alter type … add value` is therefore permitted
  inside a transaction, but the new value still cannot be *used* in the same
  transaction — which is exactly why `credit_reason.topup` ships alone in
  Phase 1 of the execution plan (F6).
- **`pg_graphql` is not installed.** Nothing in Phase 2 depends on it; noted so
  nobody plans a GraphQL shortcut.
- **`storage.buckets` is empty.** Phase 7 creates the first bucket this project
  has ever had, so there is no existing policy to copy.

---

## 4. Phase 0 runbook

Ownership is marked per step. Each is verifiable before the next.

**E1 — Decide A or B.** ✅ Done — option A (§1).

**E2 — Install Docker Desktop (Apple Silicon).** ✅ Done — Oliver, 2026-07-28.
Sanity check before E3, in a fresh terminal:
```bash
docker --version && docker info --format '{{.ServerVersion}} {{.Architecture}}'
```
*Verify:* both succeed without `sudo`. If `docker` is not found, it is a PATH
issue rather than a missing install — Docker Desktop's CLI symlink lands in
`/usr/local/bin`, which a non-login shell may not carry.

**E3 — Start the stack and confirm the Postgres major.** *(session)*
```bash
cd ~/dev/hrajfotbalek
npx supabase start        # first run pulls several GB of images
npx supabase status
```
*Verify:* every service running on the `config.toml` ports (API 54321, DB 54322,
Studio 54323, Mailpit/Inbucket 54324, Storage 54327), and **the Postgres major
is 17**, matching production's 17.6. ✅ Done — the stack reported 17.6, and
`major_version = 17` was already pinned in `config.toml`, so nothing needed
changing. `imgproxy` and the connection pooler stay stopped; neither is used.

**E4 — Split the credentials.** *(session)*
Local URL and keys into **`.env.test.local`**; production stays in `.env.local`,
untouched. `playwright.config.ts`, `vitest.integration.config.ts` and
`scripts/seed.ts` learn to prefer the test file, and the Playwright config gains
a guard that **throws** on a production Supabase URL.
*Verify:* `.env.local` unchanged byte-for-byte; the guard's unit test passes;
`.env.test.local` is gitignored.

**E5 — Apply the schema and seed.** *(session)*
```bash
npx supabase db reset     # replays all 20 migrations from empty
npm run seed
```
*Verify:* `db reset` completes without error — this is the first time the
migration set has been replayed from scratch rather than applied incrementally,
so a failure here is a real finding to report, not an environment quirk. The
seed then prints its fixture counts and exits 0.

**E6 — Prove the suite runs.** *(session)*
```bash
npm run test:e2e
```
*Verify:* **28/28 green**. That is the Phase 1 baseline; anything less means the
environment is wrong, not the product.

**E7 — Optional, not blocking.** *(Oliver)* `brew install gh` if you want PRs
from the terminal. Nothing in the plan needs it.

Steps that belong to gates rather than to setup, repeated here so they are not
forgotten: the hosted password minimum of 8 and the three auth email templates
(both G1), and Vercel Pro (G3).

---

## 5. What "done" means for Phase 0

- [x] **E1 decided** — option A, the local Supabase stack
- [x] **E2 complete** — Docker Desktop installed and running
- [x] **E3** — stack up on **PG 17.6**, matching production exactly; `major_version = 17` was already pinned. `imgproxy` and the pooler stay stopped; neither is used.
- [x] **E4** — `.env.test.local` holds the local credentials and is gitignored; `.env.local` verified byte-for-byte unchanged by sha256 before and after (`433f1d70…`). The guard has 14 passing unit tests. Three runners now resolve their database the same way: Playwright, `npm run seed` / `test:integration`, and `supabase/tests/run.mjs`.
- [x] **E5** — `db reset` replayed all 20 migrations from empty with no error, and `npm run seed` exits 0 after the stale waitlist assertion was corrected.
- [x] **E6** — **28/28 E2E green** from a fresh reset + seed, in 1.2 minutes.
- [x] The version table in §2 re-checked: **Docker 29.6.2**, server 29.6.2, aarch64, 8 GB allocated.

Until every box is ticked, the execution plan's Phase 1 does not start.
