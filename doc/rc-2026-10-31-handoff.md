# EpoMail Release Convergence Handoff (`release/2026-10-31`)

- **Branch**: `release/2026-10-31` (branched from `origin/master` @ `3e1ef741eb57d77908c1f23ad83e6c0cee9e931d`)
- **Date**: 2026-10-31
- **Stage 4 code commits** (this handoff's stage): `6369c93` (merge), `fe405a2`, `7f39f49`, `ade1f87`, `2b83f4c`
- **Final SHA**: this documentation commit — run `git rev-parse HEAD` on `release/2026-10-31`
- **Stage 3 code commit**: `a0680e8399f01395725ff9f372032de303cf4e4d` (`a0680e8`) — deps / CI / tests
- **Merged parallel session**: `6cd14ff`, `42352a0`, `a1b6599`, `d99c765` (see §2.1 and §4.1)
- **Previous tip**: `c9039c96d6ef975718d37cfce2b23ba26335887c` (`c9039c9`) — Stage 2 documentation
- **Stage 1 (Linux, backend)**: `748643a8989c27b0a14dbed4922ed29759092bf0` (`748643a`)
- **Stage 2 (Windows, frontend/deps/CI/build)**: `b575cce` → `dbba169` (see §4)

---

# Stage 4 — Windows takeover: bind repair, dependency closure, CI determinism (2026-10-31)

## 4.1 Workspace synchronization (completed, not rebased)

The workspace arrived at `333a3573c9f516ab9be90a5436136626be0dbc83` with an
**unfinished merge** of `origin/release/2026-10-31`: the local branch had seven
commits the remote did not, the remote had four (Linux Argon's CI/test/report
work), and four files were conflicted. The merge was completed as
`6369c93b94238a258f3931513e12866ef4882e6c`; nothing was rebased, force-pushed,
or deleted.

Conflict resolutions:

- **`.github/workflows/secret-scanning.yml`** — kept the local `gitleaks git`
  command and the all-zero-before branch. `gitleaks detect` is only a hidden,
  deprecated v8 alias; the remote side kept `detect`, which is still valid but
  does not fix the invalid `0000..sha` range on a brand-new branch.
- **`scripts/build-prod.mjs`** — kept both intents: the `cwd`-based runner,
  Windows `pnpm.cmd` shim, and `--frozen-lockfile` from the local side, plus
  the pinned `corepack pnpm@10.34.5` and `CI=true` from the remote side.
- **`CHECKLIST.log` / this file** — both histories were kept; no record was
  overwritten.

After the merge, `pnpm install --frozen-lockfile` passed in the repository
root and in all three apps.

## 4.2 A real settings-page bind defect, found and fixed

The signed-in OAuth bind flow was **not completable in a browser**. The Worker
redirected to:

```
/settings/security?oauth_bind=linked#oauth_link=<claim>
```

`mail-vue` routes through `createAccountHistory()`, which permits only
`/mail/u/N/#route`. On first load, because `#oauth_link=...` is not a route, the
history parser returned `/oauth_link=...`, discarded the path and the
`?oauth_bind` query, and canonicalised to `/mail/u/0/#oauth_link=...`. The
settings page never mounted, the claim was never redeemed, and a multi-account
user could additionally have the active session switched to slot 0.

Fix (`fe405a22bea7b7895ef4bba77b3e0b9f77ad0a92`):

- `startBind` records a validated `accountIndex` (0–99) in the OAuth state
  intent. It only shapes the client-side URL; the claim remains bound to the
  initiating session hash, so a forged index cannot complete another user's
  bind.
- The callback now redirects to
  `/mail/u/<index>/#settings/security?oauth_bind=<outcome>&oauth_link=<claim>`.
  The claim is still inside the fragment and is never sent to a server.
- `setting/index.vue` reads `route.query.oauth_link` and retains a fallback for
  the already-issued `#oauth_link=` shape.
- Worker test `returns the claim to the account slot that started the bind`
  asserts the pathname, fragment and claim. The Chromium full-stack suite now
  loads a bind return, asserts the claim is posted exactly once to
  `/api/my/oauthIdentities/bind/complete`, and that the address bar is
  scrubbed.

The login-page bind flow (unbound identity → `/login/...#oauth_bind=`) was not
changed; its 13/13 Playwright scenarios still pass.

## 4.3 Dependencies

Measured on the merged tree (`pnpm audit` and `pnpm audit --prod`):

| App | Full audit (high / critical) | Production `--prod` | Notes |
| :--- | :--- | :--- | :--- |
| `mail-vue` | **0 / 0** | 0 / 0; 1 moderate (`echarts` 5) | `follow-redirects` 1.16.1 → 1.16.2 removed the only production high |
| `temp_login_ui` | **0 / 0** | 0 / 0 | clean |
| `mail-worker` | 9 / 2 (all devDependencies) | **0 / 0**; 1 low (`deepmerge`) | `vitest` 3.0.9 → 3.2.7 cleared the `vitest` criticals |

Changes:

- `mail-vue`: override `follow-redirects@>=1.16.0 <1.16.2` → `1.16.2`
  (axios transitive, one high, production).
- `mail-worker`: `vitest ~3.0.7` → `~3.2.6` (resolves 3.2.7), inside the
  pool's declared peer range `2.0.x - 3.2.x`.

Not closed, with reasons:

| Finding | Scope | Why it remains |
| :--- | :--- | :--- |
| `tinypool` ≤2.1.0 / <2.1.2 (critical, 2 advisories) | dev | vitest 3.2.7 requires `tinypool ^1.1.1`; the fix is `tinypool 2.x`, which arrives with vitest 4/the renamed `@cloudflare/vitest-plugin`. Cannot be forced without breaking the pool. |
| `wrangler` <4.59.1 (high) | dev | The pool pins `wrangler 4.57.0` as a hard dependency. The advisory is in `wrangler pages deploy`, which this project never runs. |
| `ws` <8.21.0 (high) | dev | Overriding to 8.21 breaks miniflare's WebSocket loopback and every Worker test (verified and reverted in Stage 2). |
| `sharp` <0.35.5 (high, 3 advisories) | dev | Pinned inside miniflare as a native image dependency; no production path uses miniflare's image binding. |
| `zod` <4.6.6 (high) | dev | The pool pins zod 3.x; the fix is a major with a different API. |
| `echarts` <6.1.0 (moderate) | production | Requires a 5 → 6 major upgrade of a heavily configured chart library; deferred as its own window. |

## 4.4 CI root cause, from the actual GitHub runs

Two remote runs were inspected through the public Actions API:

- `Quality Gates` run `41062713412` at `d99c765` — failed in
  **Worker test suite**.
- `Security Audit` run `41061614783` at `42352a0` — failed in the same step;
  the same workflow passed at `d99c765`, so the failure is timing-dependent.

The check-run annotations point only at
`mail-worker/test/mail-pipeline-convergence.spec.js`:
`D1_ERROR: no such table: user` and `no such table: email`. Each spec creates the
full schema in `beforeAll`; parallel file runtimes let one file's isolated
storage rollback remove tables another file was still using.

Fix (`ade1f878a22cf5e11118c8c631147335993ab1d5`): `poolOptions.workers.singleWorker: true`.
All files run serially in one runtime. On this Windows host the full suite now
passes **in one invocation**: 17/17 files, 209/209 tests. This also removes the
`ConnectEx #1225` failures caused by ~17 simultaneous workerd runtimes. No
assertion was changed, and `reg-key.spec.js` now uses row-level cleanup rather
than `DROP TABLE`.

The gitleaks gate was verified against the v8.24.3 documentation: `gitleaks git`
is the current command and `--log-opts` is supported; `detect` is deprecated
but still hidden. No workflow was deleted, softened, or wrapped in
`continue-on-error` in this stage.

## 4.5 Build and lockfile reproducibility

- `wrangler-test.toml` and `wrangler-action.toml` now invoke the same
  `node ./build.mjs` entry as production, so test/action builds use
  `--frozen-lockfile` and the pinned pnpm instead of rewriting lockfiles.
- `scripts/build-prod.mjs` bounds the `corepack pnpm@10.34.5` probe to 15s; an
  offline machine falls back to the local pnpm instead of hanging.
- `wrangler deploy --dry-run` re-ran the real build hook: exit 0, 5490.85 KiB
  upload / 1136.55 KiB gzip. Both frontend builds and the login bundle copy
  completed.

## 4.6 Verification actually executed in this stage

| Gate | Command | Result |
| :--- | :--- | :--- |
| Worker suite (single invocation) | `pnpm --dir mail-worker test` | **PASS — 17/17 files, 209/209 tests, exit 0** |
| Login UI typecheck | `pnpm --dir temp_login_ui run typecheck` | **PASS** |
| Login UI unit tests | `pnpm --dir temp_login_ui test` | **PASS — 15/15** |
| Production build | `node scripts/build-prod.mjs` | **PASS — exit 0** |
| Worker dry-run | `wrangler deploy --dry-run` | **PASS — 5490.85 KiB / gzip 1136.55 KiB** |
| Full-stack smoke | `node tests/fullstack-smoke.mjs` | **PASS — 13/13** |
| Browser E2E (real Worker) | `node tests/fullstack-browser-e2e.mjs` | **PASS — 11/11** (includes the new bind-return scenario) |
| Login UI E2E (mocked API) | `node tests/oauth-bind-login-ui-e2e.mjs` | **PASS — 13/13** |
| i18n | symmetry / audit / hardcoded / auth-locale | **PASS — all exit 0** (1946 keys × 6 locales; 2163 literal keys; 142 auth keys) |
| Secret scan | tree / history / scanner self-test | **PASS — 1254 files, 4121 blobs, 0 findings** |
| Frozen installs | root + three apps | **PASS** |
| Dependency audit | `pnpm audit` / `--prod` | See §4.3 |

`i18n-hardcoded` still prints its existing advisory list (421 lines) and exits
0; this stage added no user-visible strings. The Windows Vitest pool prints
`EBUSY` warnings while deleting its temporary miniflare directories after a
successful run; the exit code is 0 and no assertion is affected. Ubuntu CI
remains the authoritative gate for the runner itself.

### 4.6.1 Post-push runner verification (code SHA `e8c7984`)

The push produced two workflow sets (both against `e8c79846`); **all six runs
completed success**:

| Workflow | Run | Verified jobs |
| :--- | :--- | :--- |
| Quality Gates | `41162646757` | Worker test suite **success**, Wrangler dry-run **success**, login UI typecheck/unit/build, mail-vue build, Playwright E2E, i18n, diff hygiene, secret scan |
| Security Audit | `41162646788` | Worker security tests, i18n, working-tree + history secret scan |
| Offline Secret Scanning Gate | `41162643045` / `41162646832` | built-in scanner + gitleaks history gate |

This closes the runner-execution item that was NOT-TESTED before the push. The
two workflow runs visible for the same SHA are duplicate triggers on the same
commit, not two different results.

`NOT-TESTED` from this host, still requiring an external environment: live
OAuth provider callbacks; live Resend / Mailjet / Cloudflare outbound; live
R2 / S3 / B2; cloud D1 / KV restore and Worker rollback.

## 4.7 Remaining real blockers and risks

1. **P1 (conditional) — registration Turnstile is not implemented in the login
   UI.** `loginService.register` calls `turnstileService.verify` when
   `registerVerify` is `OPEN` (0) or `COUNT` (2), but `temp_login_ui` has no
   `siteKey`/Turnstile code. The shipped default is `CLOSE` (1). Keep
   registration verification closed, or implement the widget before enabling
   it. This is pre-existing, not introduced by Argon, but it is release-relevant
   if staging/production turns verification on.
2. **P1 (operational) — historical credentials.** `jwt_secret` and
   `totp_enc_key` were committed in earlier history (see
   `doc/security-audit-2026-09-22.md` §A-19). The current tree scans clean, but
   history remains. If they were not rotated after that audit, treat them as
   exposed: rotate both, invalidate `auth-uid:*`/`AUTH_INFO:*` sessions, and
   re-encrypt mail if `totp_enc_key` was the KEK. Do not rewrite history without
   coordinating every clone.
3. **P1 (carried) — legacy owner row.** Inspect and disable
   `admin@epomail.cyou` (or `user_id = 1`) in staging/production D1 and delete
   `auth-uid:<id>` from KV. The code no longer creates or escalates the row.
4. **P2 — dev-only advisories.** The two `tinypool` criticals and the
   `wrangler`/`ws`/`sharp`/`zod` highs cannot ship in the Worker bundle
   (`pnpm audit --prod` is clean). Clearing them requires a vitest 4 +
   `@cloudflare/vitest-plugin` migration and a miniflare dependency bump.
5. **P2 — `echarts` 5 moderate production advisory.** Fix is `>=6.1.0`; reserve
   a separate upgrade window and re-test charts.
6. **P2 — `riskScore` is read by the login UI but never sent by the worker**
   (defaults to 0); `mail-vue/src/request/ouath.js` remains dead code. Cosmetic,
   no release impact.

## 4.8 What Linux Argon must still do

1. ~~Push the final SHA and observe all four workflows.~~ **Done for code SHA
   `e8c7984`** (see §4.6.1): Quality Gates, Security Audit and both Offline
   Secret Scanning Gate runs are green, including the Worker test suite and
   Wrangler dry-run. Keep observing future pushes; no workflow was weakened.
2. **Confirmed for `e8c7984`**: `pnpm --dir mail-worker test` passed on
   `ubuntu-latest` in a single invocation with `singleWorker`. If a future
   change reintroduces a collection failure, capture the annotation before
   changing anything; do not edit assertions.
3. Decide on the vitest 4 / `@cloudflare/vitest-plugin` migration that clears
   the remaining dev-only criticals, then re-run all 209 tests.
4. Execute the production D1/KV cleanup and the credential-rotation runbook in
   §4.7, and attach evidence.

## 4.9 Staging / production external verification still required

- Live OAuth callback per provider against real credentials; unverified
  providers must stay `enabled: false`.
- Live outbound through Resend / Mailjet / Cloudflare Email Routing with
  `OUTBOUND_WHITELIST_ENFORCE=true`.
- Live R2 / S3 / B2 upload-read-delete plus the scheduled
  `drainObjectDeletionQueue`.
- D1 export + KV restore rehearsal and one Worker version rollback.

---

# Stage 3 — Frontend verification, dependencies, CI and build convergence (Windows)

## 1. Scope actually executed

This stage took over the workspace at `c9039c9` with two uncommitted files
(`mail-worker/package.json`, `mail-worker/pnpm-lock.yaml`) carrying unscoped
`pnpm.overrides`. Those overrides were validated, extended, and committed.

The frontend was reviewed against the Stage 1 backend by reading both sides of
every changed contract, then executed in a real browser against a real local
Worker. **No blocking frontend incompatibility was found**, so no product UI was
rewritten. What did change: three dependency/build defects, one broken CI step,
and two executable integration suites that did not exist before.

## 2. Commits

| Commit | Scope |
| :--- | :--- |
| `a0680e8399f01395725ff9f372032de303cf4e4d` | `fix(release)`: dev-advisory uprems, gitleaks v8 gate repair, `test:serial`, full-stack smoke + browser E2E |
| `333a3573c9f516ab9be90a5436136626be0dbc83` | `docs(release)`: first write-up of this stage |
| _(merge commit)_ | integration of the parallel remote session (§2.1) |

### 2.1 Merge with the parallel remote session

While this stage was running, another session pushed four commits to
`origin/release/2026-10-31` on top of `5162de5`:

- `6cd14ff` — replaced the broken `gitleaks log` call with `gitleaks detect`
  (same root cause found here independently) and added a pinned
  `corepack pnpm@10.34.5` + `CI=true` install to `scripts/build-prod.mjs`.
- `42352a0`, `d99c765` — documentation.
- `a1b6599` — replaced destructive `DROP TABLE` teardown in the worker specs
  with row-level `DELETE` (fixes a real parallel-run race) and moved the
  `security.yml` job to Node 24.14.0 / pnpm 10.34.5.

They were merged, not rebased, so the hashes already recorded in this document
and in `CHECKLIST.log` stay valid. Conflict resolution:

- **`secret-scanning.yml`** — `gitleaks detect` is a hidden, deprecated alias in
  v8; this branch keeps `gitleaks git` (the documented command) and the
  zero-before-SHA branch, because `detect` alone would still fail on a
  brand-new branch with the invalid `0000..sha` range.
- **`build-prod.mjs`** — both intents kept: the `cwd`-based runner with the
  Windows `pnpm.cmd` shim and `--frozen-lockfile`, plus the pinned
  `corepack pnpm@10.34.5` and `CI=true`. The corepack probe runs the pinned
  version once, so an offline machine falls back to the local binary instead
  of failing the build.
- **`CHECKLIST.log` / this file** — both records kept; the teardown fix and the
  admin-cleanup SQL below came from the other side.


## 3. Files and modules changed

### 3.1 CI — a deterministic gate failure, fixed at the root

**`.github/workflows/secret-scanning.yml`** — the gitleaks steps invoked
`gitleaks log`, which is a **v7** subcommand; gitleaks v8 (the version the job
downloads, 8.24.3) removed it and exits 1 with *unknown command*. Because the
install step is best-effort, the failure only appeared when the download
succeeded — i.e. on a healthy runner the Offline Secret Scanning Gate failed
every push, while on a blocked runner the job printed the explicit
"gitleaks unavailable" warning instead.

The steps now call `gitleaks git --log-opts=...`. A brand-new branch
(`github.event.before` all zeros) previously produced the invalid range
`0000..sha`; it now scans `--all`. Findings still fail the job; nothing was
skipped, softened, or wrapped in `continue-on-error`. The built-in scanner
(`scan-staged-secrets.mjs`) is unchanged and still runs first.

The other three workflows were re-read line by line and their commands were
executed locally (see §5); no other code-level defect was found. **Actual
GitHub-runner execution is NOT-TESTED** from this host — it requires the push.

### 3.2 Dependencies

| App | Before (full audit) | After | Production (`--prod`) |
| :--- | :--- | :--- | :--- |
| `mail-vue` | 3 high, 1 moderate, 1 low | **0 high**, 2 moderate, 2 low | 1 moderate (`echarts`) |
| `temp_login_ui` | 12 high, 16 moderate, 6 low | **0 — completely clean** | 0 |
| `mail-worker` | 28 high, 32 moderate, 12 low, 3 critical | 9 high, 4 moderate, 2 low, 3 critical | 1 low (`deepmerge`) |

Closed inside the existing major line (no runtime behaviour touched):

- `mail-vue`: `brace-expansion` 1.1.16 → 1.1.21 and 2.1.2 → 2.1.7,
  `sharp` 0.35.2 → 0.35.5, `serialize-javascript` 6.0.2 → 7.1.4.
- `temp_login_ui`: `vite` 6.3.5 → ^6.4.5 (dev-server arbitrary file read),
  plus overrides `nanoid` 3.3.20, `undici` 7.30.1, `source-map-js` 1.2.2,
  `sharp` 0.35.5.
- `mail-worker`: `undici` 7.14/7.24 → 7.30.1, plus the previously uncommitted
  `nanoid` / `postcss` / `picomatch` / `rollup` overrides.

`mail-vue` also moved `@vitejs/plugin-vue` `^5.2.1` → `^6.0.10`. Version 5
declares `vite ^5 || ^6` while the app runs Vite 7 — pnpm warned on every
install. Version 6 declares Vite 7 support; the production build was re-run to
confirm the plugin swap changes nothing in the output.

Every one of these was re-validated: `pnpm install --frozen-lockfile` for all
three apps, both app builds, the login unit tests, the E2E suites, and the
worker suite.

An earlier note from the merged session listed `basic-ftp` (critical) and
`lodash` / `dompurify` / `rollup` (high) as an open P0. None of those appear in
the current audit: `basic-ftp` is not in any of the three lockfiles,
`dompurify` resolves to 3.4.17 and `lodash` is already past its advisory range
via the existing override. The table above is the measured state of this tree,
not a copy of that note.

### 3.3 Test infrastructure added

- **`mail-worker/package.json`** — `test:serial`: `vitest run --maxWorkers=1`.
  The full 17-file suite passes **208/208** serialized on this host (see §6.1).
  CI keeps the parallel invocation.
- **`tests/fullstack-smoke.mjs`** — starts `wrangler dev` on a throwaway
  `--persist-to` directory with `EMAIL_OUTBOUND_ENABLED=false`, then asserts
  cold `POST /api/init` (and idempotent re-init), owner login, `websiteConfig`
  switches, `/oauth/providers`, OAuth `403 oauth_disabled`, `sidebarStats`
  counters, `email/list`, `account/list`, outbound `403 outbound_disabled`,
  anonymous `401`, and the built `/login/` app. Removes the persist directory
  in `finally`; no external calls.
- **`tests/fullstack-browser-e2e.mjs`** — Chromium against that same real
  stack: form login → `/mail/u/0/#inbox`, token persisted, the mail app
  actually mounts (the custom `/mail/u/N/` history resolves `#inbox`, not the
  `/:username` profile fallback or 404), `/api/email/list` 200, the security
  page's linked-identity section renders from `/api/my/oauthIdentities`, no
  horizontal overflow at 375×812, and a missing token redirects to `/login/`.

### 3.4 Frontend contracts re-verified against Stage 1 source

No change was required, but each was read on both sides and exercised:

- OAuth provider visibility: `websiteConfig.oauthProviders[k].configured` is
  `clientId && clientSecret`; the login UI treats `configured: 0` as
  unconfigured and renders it disabled. Match.
- OAuth callback failure: worker redirects `oauth_denied` /
  `oauth_missing_code` / `oauth_state_invalid` / `oauth_failed` /
  `oauth_disabled` to `/login?error=…`; the login app shows a localized generic
  message and clears the pending client state. Cloudflare Assets also answers
  `/login` with a 307 to `/login/?…`, verified live.
- Bind flow: `/oauth/bindUser` 200/400/409/410/425/429 classification in
  `oauth-bind.ts` matches `oauth-service` exactly; the signed-in bind path in
  `setting/index.vue` (claim token in the fragment → `/my/oauthIdentities/bind/complete`)
  matches `oauth-identity-service`. Both are covered by tests.
- MFA: `tempToken` / `hasTotp` / `hasPasskeys` / `hasBackupCodes` /
  `passkeys` / `passkeyChallenge` / `stepUpRequired` all match `loginService`.
  (`riskScore` is still read by the UI and never sent — defaults to 0.)
- Session expiry: body-level and HTTP-level 401 both call
  `forceLogoutToLogin`, verified by browser test.
- Mail pipeline: `email/list` / `email/latest` account-ownership rules,
  `sidebarStats` field names, `/oss-url/batch`, and the 403 outbound gate all
  match the client. No regression from `748643a`.

## 4. Stage 2 recap (unchanged)

`b575cce` sidebar SQL, `e450cbd` Windows-capable harness + runtime advisories,
`dbba169` release-branch CI triggers + frozen prod installs, `e4981a3`/`c9039c9`
documentation. Details in git history; the substantive fixes remain as
described in those commit messages.

## 5. Verification actually executed (this workspace, Windows)

| Gate | Command | Result |
| :--- | :--- | :--- |
| Worker suite (serialized) | `pnpm --dir mail-worker run test:serial` | **PASS — 17/17 files, 208/208 tests** |
| Worker suite (single invocation) | `pnpm --dir mail-worker test` | **FAIL — workerd fallback `ConnectEx #1225` before collection, all 17 files. Host limitation, see §6.1.** |
| Worker dry-run | `wrangler deploy --dry-run` (production config) | **PASS** |
| Login UI | `tsc --noEmit` / 15 unit tests / `vite build` | **PASS — 15/15, build 7.9s** |
| mail-vue build | `pnpm --dir mail-vue run build` | **PASS** |
| Production pipeline | `node scripts/build-prod.mjs` | **PASS — exit 0** |
| Full-stack smoke | `node tests/fullstack-smoke.mjs` | **PASS — 13/13** |
| Browser E2E (real Worker) | `node tests/fullstack-browser-e2e.mjs` | **PASS — 10/10** |
| Login UI E2E (mocked API) | `node tests/oauth-bind-login-ui-e2e.mjs` | **PASS — 13/13** |
| i18n | `i18n-symmetry` / `i18n-audit` / `i18n-hardcoded` / `i18n-auth-locale` | **PASS — all exit 0** (3056 / 1946 keys × 6 locales; 142 auth keys) |
| Secret scan | `secret-scan.mjs`, `scan-staged-secrets.mjs --self-test`, `--push` | **PASS — 1252 files, 0 findings** |
| Frozen installs | root + `mail-worker` / `mail-vue` / `temp_login_ui` | **PASS** |
| Dependency audit | `pnpm audit` and `pnpm audit --prod` per app | See §3.2 |

`NOT-TESTED` (no environment for it here): GitHub Actions runner execution of
all four workflows; live OAuth provider callbacks; live Resend / Mailjet /
Cloudflare Email Routing outbound; live R2 / S3 / B2 upload-read-delete; cloud
D1 / KV restore and Worker rollback.

## 6. Remaining real blockers

### 6.1 P1 — Windows cannot run all 17 worker files in a single process
One invocation fails during collection with
`Fallback service failed to fetch module … ConnectEx #1225` (and occasionally
`#52`). Every file passes alone; the whole suite passes when serialized
(`--maxWorkers=1`, 208/208) and has passed once as a single run. The cause is
looped-back module-fallback connections under ~17 concurrent workerd runtimes
on this host, not repository code. **Ubuntu CI remains the authoritative gate
and must confirm the parallel invocation.**

### 6.2 P1 — Critical/high advisories pinned by the Cloudflare test harness
All remaining `mail-worker` advisories are `devDependencies`; `pnpm audit
--prod` reports zero high/critical, so none can ship in the Worker bundle.

| Package | Severity | Why it stays |
| :--- | :--- | :--- |
| `vitest` < 3.2.6, `tinypool` ≤ 2.1.0 | critical | Only fixed in vitest 4, which requires `@cloudflare/vitest-plugin` (the pool package was renamed) and re-validating all 208 tests. |
| `ws` < 8.21.0 | high | Overriding it to 8.21 breaks miniflare's WebSocket loopback and every worker test — already verified and reverted in Stage 2. |
| `sharp` < 0.35.0, `zod` < 4.6.6 | high | Native/API pins inside miniflare; zod must stay on the 3.x API. |
| `wrangler` 4.57.0 | high | Pinned by `@cloudflare/vitest-pool-workers@0.12.0`; the advisory is in `wrangler pages deploy`, which this project never runs. |

`temp_login_ui` and `mail-vue` have no high/critical advisories left.

### 6.3 P2 — `echarts@5` XSS advisory (production, moderate)
Fix is `>=6.1.0`, a major upgrade of a charting library the app configures
extensively. Charts render operator-authored configuration only. Deferred out
of a release branch; it should be scheduled as its own window.

### 6.4 P2 — cosmetic / dead code found, deliberately not changed
- `AuthForm` reads `riskScore` from the MFA payload that the worker never sends.
- `mail-vue/src/request/ouath.js` is still dead (`oauthLinuxDoLogin`,
  `oauthBindUser` have no callers); `oauthLinuxDoLogin` would now be rejected
  because LinuxDo requires `state`.
- Legacy `linuxdoSwitch` / `linuxdoClientId` remain in `websiteConfig` with no
  admin UI and no login button — dead configuration, not a regression.
- The outbound-gate `BizError` messages are hard-coded English; they only
  surface while `EMAIL_OUTBOUND_ENABLED=false` (staging), so they were left.

### 6.5 Carried over from Stage 1 (unchanged)

- Inspect and disable the pre-existing `admin@epomail.cyou` row in staging /
  production D1 and delete `auth-uid:<id>` from KV. Stage 1 code never deletes
  existing rows, so this is an operator action:
  ```sql
  -- 1) Inspect first (read-only)
  SELECT user_id, email, type, status, is_del FROM user
   WHERE lower(email) = 'admin@epomail.cyou' OR user_id = 1;
  -- 2) If it exists, disable login/send without deleting audit or mail history
  UPDATE user    SET status = 1 WHERE lower(email) = 'admin@epomail.cyou';
  UPDATE account SET status = 1 WHERE lower(email) = 'admin@epomail.cyou';
  ```
  Then `wrangler kv key delete auth-uid:<user_id> --namespace-id <id>` so any
  live session dies immediately.
- Reconcile legacy `audit_log` columns, verify disabled providers + outbound
  whitelist, record a D1 export and a Worker rollback rehearsal.

## 7. What Linux Argon must still do

1. Push / observe `release/2026-10-31`: confirm **all four** workflows now pass
   on the runner — in particular the Offline Secret Scanning Gate with
   gitleaks actually installed (§3.1). This is the one gate this host cannot
   prove.
2. Confirm `pnpm --dir mail-worker test` in a **single** invocation is green on
   `ubuntu-latest`. If it is not, the parallel runner must be split by file
   group the same way this host does — but do not change the assertions.
3. Decide on the harness migration that clears the two `critical` advisories:
   `@cloudflare/vitest-plugin` + `vitest@4`, then re-run all 208 tests.
4. Execute the production D1/KV cleanup in §6.5 and attach the evidence.

## 8. Staging / production external verification still required

- Live OAuth callback per provider against real credentials (unverified
  providers must stay `enabled: false`).
- Live outbound through Resend / Mailjet / Cloudflare Email Routing with
  `OUTBOUND_WHITELIST_ENFORCE=true`.
- Live R2 / S3 / B2 upload-read-delete plus the scheduled
  `drainObjectDeletionQueue`.
- D1 export + KV restore rehearsal and one Worker version rollback.

---

# Appendix — Stage 1 (Linux, backend) summary

## A1. Modules


**`a1d0805` — account & init security**
- `utils/admin-utils.js`: super-admin authority derives only from `env.admin`.
- `service/user-service.js`: `|| uid === 1` purge bypass removed.
- `init/init.js`: no seeding of `admin@epomail.cyou`/`123456`; no re-enabling of
  disabled visitor rows; `admin_initial_password` mandatory outside development;
  six `audit_*` fields moved to `setting_ext`.
- `entity/setting.js` + `service/setting-service.js`: `setting` 102 → 96 columns
  (D1 `SQLITE_MAX_COLUMN` is 100) with transparent `setting_ext` read/write.
- `test/init-visitor-security.spec.js`: 5 regression tests.

**`4aefb56` — auth & OAuth convergence**
- `utils/one-time-credential.js`: `revokeClientFlows` on disable.
- `service/setting-service.js`: Apple `configured` requires `clientSecret`.
- `service/oauth-service.js`, `api/oauth-api.js`, `service/oauth-identity-service.js`:
  `assertProviderEnabled` everywhere, mandatory `state`, burned stale state,
  S256 PKCE end-to-end, rate limit on `/oauth/authorize/:provider`,
  allow-listed redirect URIs.
- `service/oauth-provider-service.js`, `api/oauth-provider-api.js`:
  constant-time `client_secret` compare, `/oauth/userinfo` scope gating,
  rate-limited `/oauth/token`.
- `test/oauth-switch-enforcement.spec.js`: 5 adversarial tests.

**`748643a` — mail pipeline & data permissions**
- `service/email-service.js`: cross-user cascade-delete fixed by resolving
  `ownedIds`; explicit `accountId` ownership in `list`/`latest`;
  `EMAIL_OUTBOUND_ENABLED` + `OUTBOUND_WHITELIST` before provider calls;
  attachment/quota checks before send; missing `.run()` in `read`; stars
  cascaded in `batchDelete`; `getSidebarStats` via `getMailDb(c)`.
- `service/att-service.js`, `utils/file-utils.js`: guarded `emailId`, base64
  prefix normalisation.
- `service/star-service.js`, `service/resend-service.js`: strict
  `email.userId` scoping, `getUserDb(c)` for webhook writes.
- `test/mail-pipeline-convergence.spec.js`: 7 end-to-end tests.

## A3. Spec teardown race (from the merged session)

`a1b6599` removed the `DROP TABLE` calls from the worker specs' `afterAll`
hooks (`user`, `oauth`, `attachments`, …). Under the pool's parallel runtimes a
teardown could drop a table another file was still using, producing
non-deterministic "no such table" failures. Row-level `DELETE` keeps each
file's isolation without touching shared schema. The final suite run recorded
in §5 includes this change.


## A2. Stage 2 recap

`b575cce` fixed the `snoozedWaiting` SQL syntax error that made
`/api/email/sidebarStats` return 500 and added the bucket regression test;
`e450cbd` upgraded `@cloudflare/vitest-pool-workers` 0.7.8 → 0.12.0 (miniflare
3's hard-coded `localhost` fallback), inlined `svix`/`uuid`, raised the test
timeout, and applied the runtime advisory overrides; `dbba169` put
`release/**` inside all four workflows, removed the duplicate root
`package-lock.json`, and made the production build frozen.
