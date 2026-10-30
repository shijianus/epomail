# EpoMail Release Convergence Handoff (`release/2026-10-31`)

- **Branch**: `release/2026-10-31`
- **Final SHA (this stage)**: `a0680e8399f01395725ff9f372032de303cf4e4d` (`a0680e8`) — code/deps/CI/tests
- **Previous tip**: `c9039c96d6ef975718d37cfce2b23ba26335887c` (`c9039c9`) — Stage 2 documentation
- **Stage 1 (Linux, backend)**: `748643a8989c27b0a14dbed4922ed29759092bf0` (`748643a`)
- **Stage 2 (Windows, frontend/deps/CI/build)**: `b575cce` → `dbba169` (see §4)

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
| _(docs commit)_ | this handoff + `CHECKLIST.log` |

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
  production D1 and delete `auth-uid:<id>` from KV.
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

## A2. Stage 2 recap

`b575cce` fixed the `snoozedWaiting` SQL syntax error that made
`/api/email/sidebarStats` return 500 and added the bucket regression test;
`e450cbd` upgraded `@cloudflare/vitest-pool-workers` 0.7.8 → 0.12.0 (miniflare
3's hard-coded `localhost` fallback), inlined `svix`/`uuid`, raised the test
timeout, and applied the runtime advisory overrides; `dbba169` put
`release/**` inside all four workflows, removed the duplicate root
`package-lock.json`, and made the production build frozen.
