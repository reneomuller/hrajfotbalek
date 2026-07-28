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

### The choice, with what each actually costs on this machine

**This machine has no container runtime.** Verified: `docker`, `podman` and
`colima` are all absent from `PATH`, and neither Docker Desktop nor OrbStack is
in `/Applications`. So the two options are genuinely different amounts of work
here, not a preference.

| | **A — Local Supabase stack (Docker)** | **B — Second hosted Supabase project** |
|---|---|---|
| Install needed | **Docker Desktop for Apple Silicon** (~600 MB download, ~2.5 GB on disk, requires admin rights and a restart of the terminal) | none |
| Then | `npx supabase start` pulls ~8 container images on first run (~3–4 GB) | create a project in the dashboard, wait ~2 min for provisioning |
| Cost | free | free tier is sufficient; a second project on a paid org may bill |
| Runs offline | yes | no |
| Reset cost | seconds (`supabase db reset`) | a `reset-platform`-style script, or re-provision |
| Fidelity to production | high but not identical — local Postgres and Auth versions track the CLI, not your project | identical service versions, identical Auth behaviour |
| Auth email in tests | captured locally by Inbucket, nothing leaves the machine | real Supabase auth mail, subject to rate limits |
| Storage (Phase 7) | local storage emulation | the real thing, same policies |
| Migration workflow | `supabase db push` against local, then production | identical to production, one dashboard away from confusion |
| Risk it introduces | none to production | **a second live project one connection string away from production** — the wrong `.env.local` and a test suite writes to real data |

**Recommendation: A, Docker + local stack**, for one reason that outweighs the
install: option B puts a production-shaped credential in reach of a test runner
whose entire job is to create and destroy data. This project has already had one
incident where seeded accounts with a committed password lived in production.
The offline reset speed is a bonus; the isolation is the argument.

**If you would rather not install Docker**, option B is workable and the plan
does not change — but two conditions become mandatory: the dev project's
credentials live in `.env.test.local` (never `.env.local`), and
`playwright.config.ts` refuses to start if the URL it is given matches the
production project ref. Say which you want and Phase 0 is written against it.

Note for either path: `supabase --version` resolves to **2.109.1** already (it
is a devDependency), so the CLI itself needs no install.

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
| Docker / Podman / Colima | **absent** | **install step, if option A** |
| `gh` (GitHub CLI) | **absent** | optional; only affects PR creation from the terminal |
| `psql` | absent | not required — `scripts/apply-migration.mjs` and `supabase/tests/run.mjs` both use the `pg` package for exactly this reason |
| Disk free | 220 GiB | fine for either option |
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

- **Production Postgres is 17.6.** `alter type … add value` is therefore
  permitted inside a transaction, but the new value still cannot be *used* in
  the same transaction — which is exactly why `credit_reason.topup` ships alone
  in Phase 1 of the execution plan (F6). The local stack must be on a matching
  major; check `supabase start` output before writing migration 23.
- **`pg_graphql` is not installed.** Nothing in Phase 2 depends on it; noted so
  nobody plans a GraphQL shortcut.
- **`storage.buckets` is empty.** Phase 7 creates the first bucket this project
  has ever had, so there is no existing policy to copy.

---

## 4. Install steps for Oliver

In order. Each is verifiable before the next.

**E1 — Decide A or B** (§1). Everything below assumes A; say the word and I
rewrite Phase 0 for B.

**E2 — Install Docker Desktop (Apple Silicon).**
Download from docker.com, install, launch it once so the daemon starts, then in
a new terminal:
```bash
docker --version && docker info | head -3
```
*Verify:* both succeed without sudo.

**E3 — Start the local stack.**
```bash
cd ~/dev/hrajfotbalek
npx supabase start
```
First run pulls several GB of images. It prints an API URL, an anon key and a
service-role key.
*Verify:* `npx supabase status` lists every service as running, and the printed
Postgres major matches production's 17.

**E4 — Point the test tooling at it, not at production.**
Put the printed URL and keys in a **separate** env file, and confirm that the
one holding production credentials is untouched.
*Verify:* `grep -c . .env.local` unchanged; the new file holds the local URL.

**E5 — Apply the schema and seed.**
```bash
npx supabase db reset          # applies all 20 migrations from scratch
npm run seed                   # against the local database
```
*Verify:* the seed prints its fixture counts and exits 0.

**E6 — Prove the suite runs.**
```bash
npm run test:e2e
```
*Verify:* 28/28 green. That number is the Phase 1 baseline; anything less means
the environment is wrong, not the product.

**E7 — Optional, not blocking.** Install `gh` (`brew install gh`) if you want
PRs from the terminal. Nothing in the plan needs it.

Steps that belong to gates rather than to setup, repeated here so they are not
forgotten: the hosted password minimum of 8 and the three auth email templates
(both G1), and Vercel Pro (G3).

---

## 5. What "done" means for Phase 0

- [ ] E1 decided
- [ ] E2–E3 complete, or option B provisioned
- [ ] E4 complete and production credentials demonstrably untouched
- [ ] E5 complete: schema + seed on the dev database
- [ ] E6 complete: 28/28 E2E green against it
- [ ] The version table in §2 re-checked on the machine that will run the build

Until every box is ticked, the execution plan's Phase 1 does not start.
