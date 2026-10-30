# EpoMail Release Convergence Handoff (`release/2026-10-31`)

- **Branch**: `release/2026-10-31`
- **Stage 1 (Linux, backend)**: `748643a8989c27b0a14dbed4922ed29759092bf0` (`748643a`) — see §5 appendix
- **Stage 2 (Windows, frontend/deps/CI/build)**: see §1 for the commit list and `git rev-parse HEAD` for the tip.

---

# Stage 2 — Frontend, Dependencies, CI and Build (Windows)

## 1. Commits

| Commit | Scope |
| :--- | :--- |
| `b575ccedc861c2510af14c5234310a4b34380239` (`b575cce`) | `fix(mail)`: sidebar counter SQL repair + bucket regression test |
| `e450cbd1e4626fa457c985be73b62715e943656f` (`e450cbd`) | `build(deps)`: Windows-capable worker harness, runtime advisory remediation |
| `dbba1691a4be8358552610a28b343d3671eac8c0` (`dbba169`) | `ci(build)`: release-branch triggers, single root lockfile, frozen prod installs |
| `FILL_AT_COMMIT` | `docs`: this handoff + `CHECKLIST.log` |

Final SHA: `FILL_AT_PUSH`.

## 2. Files and modules changed

### 2.1 Real product defects found and fixed

- **`mail-worker/src/service/email-service.js` (`getSidebarStats`)** — the `snoozedWaiting` aggregate carried a stray `)` before `THEN`, so the whole statement was a SQLite syntax error. Every `GET /api/email/sidebarStats` returned `code 500`, which breaks the inbox/sidebar unread badges in `mail-vue`. One-character fix; proven by a live `wrangler dev` request returning `code 200` with real counters.
- **`mail-worker/test/mail-pipeline-convergence.spec.js`** — new regression test `serves sidebar counters for inbox, spam, trash, drafts, sent, and both snooze windows`. It seeds one mailbox with exactly one message per bucket and asserts every counter, so a 500 (or a silently wrong aggregate) fails the suite.

### 2.2 Frontend compatibility with the Stage 1 backend

Verified against source, not against prior reports:

- **OAuth provider visibility** — `temp_login_ui` derives its button list from `GET /api/setting/websiteConfig` (`oauthLoginEnabled` + `oauthProviders[key].enabled/configured`). `settingService.websiteConfig` emits `configured: 0|1` from `clientId && clientSecret`, matching the Stage 1 fail-closed change; a provider with a missing secret renders as unconfigured and is not clickable. No mismatch.
- **OAuth callback failure** — the worker redirects failures to `/login?error=oauth_failed|oauth_disabled`; `AuthForm` clears the pending client state and shows a localized generic message. Matches.
- **Login CSRF guard** — `AuthForm` requires `sessionStorage.epo_oauth_state` to equal `oauth_client_state`; the worker now echoes `stateRow.clientState` on both success and bind returns. Matches.
- **Bind flow** — `PUT /api/oauth/bindUser` with `{ email, code?, oauthUserId, provider, bindToken }`; `oauth-bind.ts` classifies 200/400/409/410/425/429/5xx exactly as `oauth-service` emits them. Matches; covered by Playwright.
- **MFA** — `beginMfaChallenge` consumes `tempToken/hasTotp/hasPasskeys/hasBackupCodes/passkeys/passkeyChallenge/stepUpRequired`; `loginService` emits all of them. Matches. (`riskScore` is read by the UI but never sent by the worker — cosmetic, defaults to 0.)
- **Session expiry** — worker returns body `code 401`; the axios interceptor calls `forceLogoutToLogin` for both body-level and HTTP-level 401. Matches.
- **Outbound gates** — `EMAIL_OUTBOUND_ENABLED=false` / `OUTBOUND_WHITELIST` surface as `code 403` with `errorCode`; the interceptor shows the server message as a warning toast. Verified end-to-end in the live smoke.
- **Dead code noted, not changed**: `mail-vue/src/request/ouath.js` exports `oauthLinuxDoLogin(code)` and `oauthBindUser(form)` with no callers; `oauthLinuxDoLogin` would now be rejected by the worker because LinuxDo requires `state`. Harmless today, but it is a stale contract if someone wires it up.

### 2.3 Test harness (worker)

- **`@cloudflare/vitest-pool-workers` `0.7.8` → `0.12.0`** — 0.7.8 bundles miniflare 3, which hands workerd a `localhost:<port>` module-fallback URL. On a host where `localhost` resolves to `::1` first, workerd's `ConnectEx` to the fallback service is refused and **every** worker test fails before collection. miniflare 4 (`resolveLocalhost`) fixes this.
- **`mail-worker/vitest.config.js`** — `server.deps.inline: ['svix', 'uuid']` (the pool's fallback misreads their CJS builds inside `"type": "module"` packages), and `testTimeout: 20000` (the 5s default is exceeded by the password/TOTP specs when several workerd runtimes share a loaded CPU). Assertions unchanged.
- Deliberately **not** upgraded: `vitest` stays `~3.0.7`. `3.2.x` passes in small runs but changes module externalisation enough to break `svix` collection in the full suite.

### 2.4 Dependencies

Production (`pnpm audit --prod`) before → after:

| App | Before | After |
| :--- | :--- | :--- |
| `mail-worker` | 1 low | 1 low (`deepmerge`, no fix published) |
| `mail-vue` | 3 high + 1 moderate + 1 low (`vue-i18n` XSS) | 1 moderate (`echarts` 5→6 major) |
| `temp_login_ui` | 12 advisories, 6 high (`react-router`) | 0 |

- `mail-vue`: `vue-i18n` `^11.1.10` → `^11.4.14` (resolved 11.4.16), `vite` `7.1.5` → `^7.3.2`.
- `temp_login_ui`: **removed `react-router`** — no source file imports it; it existed only to carry 12 advisories.
- `temp_login_ui`: **removed 5 hardcoded `*-win32-x64*` / `workerd-windows-64` devDependencies.** They were duplicates of transitive optional platform packages; a clean `pnpm install --frozen-lockfile` on Windows still resolves them, and the Linux lockfile entries (`@esbuild/linux-x64`, `@rollup/rollup-linux-x64-gnu`, …) are present, so `ubuntu-latest` installs cleanly. This was the P0 CI blocker from Stage 1.
- Scoped `pnpm.overrides` added for transitive dev-tooling advisories where the patch is inside the same major: `undici`, `nanoid`, `postcss`, `picomatch`, `rollup`, `minimatch`, `brace-expansion`, `fast-uri`, `browserslist`, `immutable`, `@babel/plugin-transform-modules-systemjs`.

## 3. Verification actually executed (Windows, this workspace)

| Gate | Command | Result |
| :--- | :--- | :--- |
| Worker suite | `vitest run` split into 5 chunks (17 files) | **PASS — 207/207 tests, 17/17 files** |
| Worker suite (single invocation) | `CI=true pnpm --dir mail-worker test` | **FAIL — environment limit, see §4.1.** Never reported as a pass. |
| Worker dry-run | `wrangler deploy --dry-run --config wrangler-vitest.toml` | **PASS** — 5490.50 KiB / gzip 1136.42 KiB |
| Login UI | `typecheck` / `test` / `build` | **PASS** — `tsc` clean, 15/15, Vite 6.41s |
| Login UI clean install | `pnpm install --frozen-lockfile` after deleting `node_modules` | **PASS** |
| mail-vue build | `pnpm --dir mail-vue run build` | **PASS** — 23–39s across runs |
| Production pipeline | `node scripts/build-prod.mjs` | **PASS** — exit 0, no warnings |
| i18n 4-gate | `i18n-symmetry` / `i18n-audit` / `i18n-hardcoded` / `i18n-auth-locale` | **PASS** — all exit 0; 1946 keys × 6 locales; 142 auth keys |
| Secret scan | `node scripts/secret-scan.mjs` | **PASS** — 1252 files, 0 secrets |
| Playwright E2E | `node tests/oauth-bind-login-ui-e2e.mjs` | **PASS** — 13/13 scenarios |
| Full-stack smoke (`wrangler dev` + fresh local D1/KV) | init → login → config → OAuth gate → sidebar → account → send gate → 401 → `/login/` | **PASS — 13/13** |
| Frozen installs | root + all three apps `--frozen-lockfile` | **PASS** |

`NOT-TESTED` (unchanged from Stage 1, still external): live OAuth provider callbacks, live Resend/Mailjet/Cloudflare Email outbound, live R2/S3/B2 object storage, Cloud D1/KV restore and Worker rollback.

## 4. Remaining real blockers

### 4.1 P1 — Windows cannot run all 17 worker test files in one process
With every file in one invocation, workerd's module-fallback loopback intermittently refuses connections (`ConnectEx #1225`), independent of directory, concurrency flags, or free ports; the same suite passes 207/207 when split into chunks of 5, and passed once as a single run. Root cause is on the host side (loopback socket handling under ~17 concurrent workerd runtimes), not in the repository. **Ubuntu CI is the authoritative gate and must confirm the single-invocation run.** A `--poolOptions.workers.singleWorker` / `--no-file-parallelism` workaround makes it worse, so no config change was committed for this.

### 4.2 P1 — Dev-only advisory residue (cannot be closed without breaking the harness)
All of these are `devDependencies`, absent from the deployed Worker bundle:

| Package | Severity | Why it stays |
| :--- | :--- | :--- |
| `tinypool` ≤2.1.0 | critical | Only fixed in tinypool 2.x, which only vitest 4 ships; vitest 4 needs the pool package that was renamed to `@cloudflare/vitest-plugin`. |
| `vitest` <3.2.6 | critical | Same blocker; 3.2.x breaks `svix` collection in the full suite. |
| `zod` <4.6.6 | high | `miniflare`/pool require zod 3 API. |
| `sharp` <0.35.5 | high | Native module pinned by miniflare; overriding risks ABI mismatch in image handling. |
| `wrangler` <4.59.1 | high | Transitive copy pinned by the pool; advisory is OS command injection in `wrangler pages deploy`, which this project never runs. |
| `ws` <8.21.0 | high | **Overriding it to 8.21 breaks miniflare's WebSocket loopback and all worker tests** — verified and reverted. |
| `serialize-javascript` ≤7.0.2 | high | Patch requires 6→7 major; `workbox-build` consumes our own source only. |

### 4.3 P1 — `@vitejs/plugin-vue@5` declares `vite ^5 || ^6` while `mail-vue` runs Vite 7
pnpm prints an unmet-peer warning on every install. The build works, so this was not changed at release time, but the pairing is unsupported and should be moved to `plugin-vue@6` in the next window.

### 4.4 P2 — `echarts` 5.x XSS advisory
Fix is `>=6.1.0`, a major upgrade. Charts render operator-authored configuration only, so it was deferred rather than taking a major bump into the release.

### 4.5 Carried over from Stage 1 (unchanged)
- Pre-existing `admin@epomail.cyou` row must be inspected and disabled in staging/production D1, and `auth-uid:<id>` deleted from KV.
- Staging cloud smoke: reconcile legacy `audit_log` columns, verify disabled providers + outbound whitelist, record a D1 export and a Worker rollback rehearsal.

## 5. What Linux Argon must still do

1. Push-open checks on `release/2026-10-31` and confirm all four workflows now run (they previously ignored `release/**`): Quality Gates, Security Audit, Offline Secret Scanning Gate, and the `login-ui` job that used to die on the Windows-only devDependencies.
2. Confirm `pnpm --dir mail-worker test` in a single invocation is green on `ubuntu-latest` after the pool `0.7.8 → 0.12.0` upgrade — that is the one gate this Windows host cannot prove.
3. Decide on the harness migration that closes the two `critical` dev advisories: `@cloudflare/vitest-pool-workers` was renamed to `@cloudflare/vitest-plugin`; the move requires `vitest@4` and re-validating all 207 tests.
4. Execute the production D1/KV cleanup in §4.5 and record the evidence.

## 6. Staging / production external verification still required

- Live OAuth callback per provider against real credentials (providers without verified credentials stay `enabled: false`).
- Live outbound through Resend / Mailjet / Cloudflare Email Routing with `OUTBOUND_WHITELIST_ENFORCE=true`.
- Live R2 / S3 / B2 upload-read-delete plus the scheduled `drainObjectDeletionQueue`.
- D1 export + KV restore rehearsal and one Worker version rollback.

---

# Appendix — Stage 1 (Linux, backend)

## A1. Modules

**`a1d0805` — fixed account & init security**
- `mail-worker/src/utils/admin-utils.js`: super-admin authority derives only from a normalized `c.env.admin` email match; the `userRow.userId === 1` fallback is gone.
- `mail-worker/src/service/user-service.js`: `|| uid === 1` purge bypass removed.
- `mail-worker/src/init/init.js`: no seeding of `admin@epomail.cyou` / `123456`; no re-enabling of disabled visitor rows; `admin_initial_password` is mandatory outside `development`; `user_base` upgraded before 6-role seeding; six `audit_*` fields moved to `setting_ext`.
- `mail-worker/src/entity/setting.js` + `src/service/setting-service.js`: `setting` reduced from 102 to 96 columns (D1's `SQLITE_MAX_COLUMN` is 100) with transparent `setting_ext` read/write.
- `mail-worker/test/init-visitor-security.spec.js`: 5 regression tests.

**`4aefb56` — auth & OAuth convergence**
- `src/utils/one-time-credential.js`: `revokeClientFlows` kills pending `oauth_state` / `oauth_login_code` / `oauth_bind` / `oauth_bind_link` rows on disable.
- `src/service/setting-service.js`: Apple `configured` requires `clientSecret` too; revocation wired into `set`.
- `src/service/oauth-service.js`, `src/api/oauth-api.js`, `src/service/oauth-identity-service.js`: `assertProviderEnabled` on every entry point, mandatory `state` on direct POST login, burned stale state, S256 PKCE end-to-end, rate limit on `/oauth/authorize/:provider`.
- `src/service/oauth-provider-service.js`, `src/api/oauth-provider-api.js`: constant-time `client_secret` compare, `/oauth/userinfo` scope gating, rate-limited `/oauth/token`.
- `mail-worker/test/oauth-switch-enforcement.spec.js`: 5 adversarial tests.

**`748643a` — mail pipeline & data permissions**
- `src/service/email-service.js`: cross-user cascade-delete fixed by resolving `ownedIds` first; explicit `accountId` ownership in `list`/`latest`; `EMAIL_OUTBOUND_ENABLED` + `OUTBOUND_WHITELIST` enforced before provider calls; attachment/quota checks moved before send; missing `.run()` in `read`; stars cascaded in `batchDelete`; `getSidebarStats` routed through `getMailDb(c)`.
- `src/service/att-service.js`, `src/utils/file-utils.js`: guarded `emailId`, base64 prefix normalization.
- `src/service/star-service.js`, `src/service/resend-service.js`: strict `email.userId` scoping, `getUserDb(c)` for webhook writes.
- `mail-worker/test/mail-pipeline-convergence.spec.js`: 6 end-to-end tests (7 as of Stage 2).

## A2. Stage 1 verification (Linux)

Worker full suite 17/17 files and 207/207 tests; unit suite 24/24; bundle dry-run 5490.57 KiB; `mail-vue` build 20.12s; login UI 15/15; i18n 4 gates; secret scan 1251 files and 4061 blobs clean.
