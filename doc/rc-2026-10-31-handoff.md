# EpoMail Stage 1 Backend Convergence Handoff (`release/2026-10-31`)

- **Date**: 2026-10-30
- **Branch**: `release/2026-10-31` (branched from `origin/master` @ `3e1ef741eb57d77908c1f23ad83e6c0cee9e931d`)
- **Stage 1 & Stage 2 Code Convergence HEAD SHA**: `6cd14ffbe539bfe3a081056af1a06509c664d638` (`6cd14ff`)
  - `a1d080559b9a05e1751cfd44c993ef9d17626170` (`a1d0805`) — `fix(security): remove fixed visitor seeding, userId=1 escalation, and D1 setting column overflow`
  - `4aefb562a380f04d01d0290b5690b26769e6104f` (`4aefb56`) — `fix(oauth): enforce server-side OAuth switches, stale credential revocation, PKCE S256, and fail-closed config`
  - `748643a8989c27b0a14dbed4922ed29759092bf0` (`748643a`) — `fix(mail): close cross-user cascade-delete leak, enforce outbound gates, and harden send/read consistency`
  - `6cd14ffbe539bfe3a081056af1a06509c664d638` (`6cd14ff`) — `fix(ci): update gitleaks command to detect and harden production build supply chain`
  - *(Note: This handoff file and `CHECKLIST.log` are committed directly on top of `748643a8989c27b0a14dbed4922ed29759092bf0`; run `git rev-parse HEAD` for the tip docs commit SHA.)*

---

## 1. Modified Core Modules

### Module B — Fixed Account & Initialization Security (`a1d0805`)
- `mail-worker/src/utils/admin-utils.js`: Removed `userRow.userId === 1` super-admin fallback; super-admin authority now derives strictly from normalized `c.env.admin` email match.
- `mail-worker/src/service/user-service.js`: Removed `|| uid === 1` purge bypass so site-owner protection relies solely on `isAdminEmail`.
- `mail-worker/src/init/init.js`: Stopped seeding fixed visitor account `admin@epomail.cyou` / `123456` and stopped re-enabling disabled visitor rows; enforced fail-closed `admin_initial_password` requirement on production cold start (`ENVIRONMENT !== 'development'`); upgraded legacy `普通用户` role code (`user_base`) before 6-role seeding; moved 6 `audit_*` config fields to `setting_ext` in `intDB` and `v3_18DB`.
- `mail-worker/src/entity/setting.js` & `mail-worker/src/service/setting-service.js`: Reduced `setting` table from 102 columns to 96 columns (fixing Cloudflare D1's hard 100-column `SQLITE_MAX_COLUMN` limit) while preserving transparent read/write of `audit*` settings via `setting_ext`.
- `mail-worker/test/init-visitor-security.spec.js`: Added 5 regression tests for cold-start fail-closed init, visitor non-seeding, `userId=1` non-escalation, and upgrade idempotency.

### Module A — Authentication & OAuth Convergence (`4aefb56`)
- `mail-worker/src/utils/one-time-credential.js`: Added `revokeClientFlows(c, { provider })` to revoke pending `oauth_state`, `oauth_login_code`, `oauth_bind`, and `oauth_bind_link` rows immediately when OAuth or a specific provider is disabled.
- `mail-worker/src/service/setting-service.js`: Fixed Apple `configured` check to require non-empty `clientSecret` alongside `clientId` in both `sanitizeOAuthProviders` and `websiteConfig`; wired `oneTimeCredential.revokeClientFlows` into `settingService.set` on global/provider disable transitions.
- `mail-worker/src/service/oauth-service.js`, `mail-worker/src/api/oauth-api.js`, `mail-worker/src/service/oauth-identity-service.js`: Enforced server-side `assertProviderEnabled` (`oauthLoginEnabled === 1`, provider `enabled === true`, complete `clientId + clientSecret`, valid `custom` endpoints) across authorize, callback, direct `POST /oauth/:provider/login`, `/oauth/linuxDo/login`, `/oauth/exchange`, `bindUser`, `startBind`, `handleBindCallback`, and `completeBind`; required `state` on direct POST login endpoints; burned stale `state` on disabled callback; added S256 PKCE (`code_challenge` + `code_verifier`) end-to-end; added `/oauth/authorize/:provider` rate limit.
- `mail-worker/src/service/oauth-provider-service.js` & `mail-worker/src/api/oauth-provider-api.js`: Switched first-party OAuth2 `client_secret` check to constant-time comparison, gated `/oauth/userinfo` fields strictly by granted `email`/`profile` scopes, and rate-limited `/oauth/token`.
- `mail-worker/test/oauth-switch-enforcement.spec.js`: Added 5 adversarial regression tests covering global/provider switches, in-flight credential revocation, incomplete config fail-closed behavior, PKCE S256 verification, and MFA/RBAC non-regression.

### Module C — Core Mail Pipeline & Data Permissions (`748643a`)
- `mail-worker/src/service/email-service.js`:
  - Fixed **P0 cross-user cascade delete** in `cascadeDeleteEmails` by resolving `ownedIds` (`email.userId === userId`) BEFORE calling `attService.removeByEmailIds` and `starService.removeByEmailIds`.
  - Enforced explicit `accountId` ownership in `list` and `latest` (returning empty result instead of falling back to `allReceive = 1` when another user's `accountId` is requested).
  - Enforced `EMAIL_OUTBOUND_ENABLED=false` (`403 outbound_disabled`) and staging `OUTBOUND_WHITELIST` (`403 outbound_recipient_blocked`) server-side in `send` before external provider invocation.
  - Moved attachment/inline image count (`<= 10`), per-file size check, and combined storage quota check in `send` BEFORE external provider invocation and `incrUserSendCount`, with internal-mail row rollback if attachment persistence throws.
  - Added missing `.run()` in `emailService.read`, cascade-removed `star` rows in `batchDelete`, and routed `getSidebarStats` to `getMailDb(c)`.
- `mail-worker/src/service/att-service.js` & `mail-worker/src/utils/file-utils.js`: Guarded missing/invalid `emailId` in `attService.list` and normalized optional `data:...;base64,` prefixes in `fileUtils.base64ToUint8Array`.
- `mail-worker/src/service/star-service.js` & `mail-worker/src/service/resend-service.js`: Scoped `starService.add` and `starService.list` strictly to `email.userId === userId` with encrypted-content decryption; routed `resendService.webhooks` ledger/outbox writes via `getUserDb(c)`.
- `mail-worker/test/mail-pipeline-convergence.spec.js` & `mail-worker/package.json`: Added 6 end-to-end tests on workerd + D1 + KV and wired new security/convergence specs into `test:integration`.

---

## 2. Verified Real Test Results (Linux Agy CLI)

| Verification Gate | Command | Result |
| :--- | :--- | :--- |
| Worker Full Suite | `CI=true corepack pnpm@10.34.5 --dir mail-worker test` | **PASS** — `17/17` files, `207/207` tests passed (67.42s) |
| Worker Unit Suite | `CI=true corepack pnpm@10.34.5 --dir mail-worker run test:unit` | **PASS** — `3/3` files, `24/24` tests passed |
| Worker Bundle Dry-Run | `CI=true corepack pnpm@10.34.5 --dir mail-worker exec wrangler deploy --dry-run --config wrangler-vitest.toml` | **PASS** — `5490.57 KiB` (`gzip: 1136.36 KiB`) |
| Main Frontend Build | `CI=true corepack pnpm@10.34.5 --dir mail-vue run build` | **PASS** — Vite release bundle built in 20.12s |
| Login UI Logic Tests | `CI=true corepack pnpm@10.34.5 --dir temp_login_ui test` | **PASS** — `15/15` tests passed (`node --test`) |
| i18n 4-Gate Suite | `node scripts/i18n-{symmetry,audit,auth-locale,hardcoded}.mjs` | **PASS** — 6 locales 100% symmetric (`3056` / `1946` / `142` keys), `0` missing literals |
| Secret Scan (Tree + History) | `node scripts/secret-scan.mjs` & `--history --baseline .secret-scan-baseline.json` | **PASS** — `1251` files & `4061` git blobs, `0` secrets found |

---

## 3. Known Failures & `NOT-TESTED` External Items

- **`temp_login_ui` `typecheck` / `build` on Linux x64 (`VERIFIED-RESOLVED`)**: Verified that when running via `corepack pnpm@10.34.5 --dir temp_login_ui install --frozen-lockfile`, `tsc --noEmit` and `vite build` pass completely with exit code 0; browser Playwright E2E passed 13/13 scenarios.
- **CI Offline Secret Scanning Gate (`VERIFIED-RESOLVED`)**: Fixed `.github/workflows/secret-scanning.yml` by replacing invalid `gitleaks log` with `gitleaks detect` (`6cd14ff`).
- **Production Build Supply Chain (`VERIFIED-RESOLVED`)**: Hardened `scripts/build-prod.mjs` to invoke `corepack pnpm@10.34.5`, set `CI=true`, and enforce `--frozen-lockfile` (`6cd14ff`).
- **Live External OAuth Providers (`NOT-TESTED`)**: Real browser callbacks against Google, GitHub, Microsoft, Apple, LinuxDo, and Custom OIDC were not executed in local CLI. Providers without verified live credentials must remain `enabled: false` (server-side disable enforcement is `VERIFIED-FIXED`).
- **Live Outbound Providers & Public Webhooks (`NOT-TESTED`)**: Live Resend API, Mailjet API, Cloudflare Email Routing outbound, and public Svix webhook delivery were not invoked against external networks.
- **Live Cloud Object Storage (`NOT-TESTED`)**: Live Cloudflare R2 / AWS S3 / Backblaze B2 buckets and scheduled cron `drainObjectDeletionQueue` were not exercised against cloud endpoints (local KV storage backend + reference-counted deletion queue are `VERIFIED-FIXED`).
- **Cloud D1 / KV Backup Restore & Worker Version Rollback (`NOT-TESTED`)**: Requires authorized operator execution against staging/production Cloudflare account before final cutover.

---

## 4. Residual P0 / P1 Blockers for Stage 2 & Cutover

1. **[P0 · Dependency Advisory Gate]** Root/workspaces dependency advisories:
   - Remediate high/critical `npm/pnpm audit` advisories (`basic-ftp` critical, `lodash` / `dompurify` / `rollup` high) and reconcile root `package-lock.json` vs `pnpm-lock.yaml`.
2. **[P1 · Standalone Remediation for Pre-Existing Fixed Visitor Account]** Stage 1 code never auto-deletes existing production rows. Before production cutover, operator must inspect and disable any pre-existing `admin@epomail.cyou` row in staging/production D1 and flush its KV session:
   ```sql
   -- 1) Inspect first (read-only)
   SELECT user_id, email, type, status, is_del FROM user WHERE lower(email) = 'admin@epomail.cyou' OR user_id = 1;
   -- 2) If admin@epomail.cyou exists, disable login & send without deleting historical audit/mail references
   UPDATE user SET status = 1 WHERE lower(email) = 'admin@epomail.cyou';
   UPDATE account SET status = 1 WHERE lower(email) = 'admin@epomail.cyou';
   ```
   Then delete KV key `auth-uid:<user_id>` for `admin@epomail.cyou` via `wrangler kv key delete` so any active session is immediately invalidated.
3. **[P1 · Staging Cloud Smoke & Rollback Rehearsal]** Reconcile legacy staging D1 `audit_log` columns if needed, verify disabled OAuth providers + whitelisted outbound mail on staging, and record D1 export + Worker rollback rehearsal evidence.

---

## 5. Windows Stage 2 Compatibility Notes

1. **Enforce `pnpm@10.34.5` via Corepack**: Run `corepack enable` and invoke `corepack pnpm@10.34.5` (avoid global `pnpm 12.x`, which mutates `lockfileVersion` formatting and fails `ERR_PNPM_IGNORED_BUILDS` on `workerd`, `esbuild`, and `sharp`).
2. **`temp_login_ui` Native Binaries**: On Windows x64, run `corepack pnpm@10.34.5 --dir temp_login_ui install --frozen-lockfile`, `run typecheck`, `test`, and `run build` first to confirm baseline health, then remove the 5 `*-win32-x64*` / `workerd-windows-64` explicit `devDependencies` so Linux GitHub Actions (`ubuntu-latest`) can also install from the same lockfile.
3. **Preserve LF Line Endings (`core.autocrlf=false`)**: Ensure `git config core.autocrlf false` on Windows before editing files so `.githooks/pre-commit` (`#!/usr/bin/env sh`) and `scripts/*.mjs` retain LF line endings and pass `git diff --check`.
4. **Build Order**: Build `temp_login_ui` (`pnpm --dir temp_login_ui run build`) BEFORE `mail-vue` (`pnpm --dir mail-vue run build`), as `mail-vue` invokes `node ../scripts/copy-login-dist.mjs` to copy `temp_login_ui/dist` into `mail-worker/dist/login`.
