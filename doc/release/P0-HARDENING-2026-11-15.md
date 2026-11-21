# P0 hardening and self-test evidence

## Release identity

- Branch: `fix/public-beta-go-blockers-2026-11-07`
- Starting candidate: `36871d180f4739092ecabbdc469a907ddc71a541`
- Final local commit: `6db7b38bb9ad9089c4e611c572383dbe64537322`
- Production deployment: not performed
- Cloudflare Staging deployment: not performed in this workspace

## Code changes

- WebAuthn signature-counter conflicts are returned as controlled `409 passkey_counter_conflict` responses. Invalid ceremony and signature input is returned as controlled `403 passkey_verification_failed` responses. Database compare-and-swap conflicts no longer escape as HTTP 500.
- Login, TOTP login, and registration reject malformed, empty, scalar, and array JSON bodies with `400 INVALID_JSON`.
- The global Hono error boundary maps JSON parser failures from every public JSON route, including OAuth, to `400 INVALID_JSON` without reflecting parser details.
- Passkey deletion accepts an empty transport body and lets the service return its normal re-authentication result.
- Email-key migration now propagates `dryRun` and keeps inspection-only requests out of the write path.
- Staging and production responses receive HTTPS enforcement, HSTS, CSP, frame isolation, content-type protection, referrer policy, and permissions policy headers.

## Self-test results on the final commit

- Worker Vitest: `51/51` files, `645/645` tests passed.
- Node integration and gate tests: `237/237` passed.
- Targeted P0 regression matrix: `41/41` passed.
- Login UI typecheck: passed.
- Login UI tests: `29/29` passed.
- Login UI production build: passed.
- Mail Vue production build and login asset copy: passed.
- Full-stack smoke: `22/22` passed.
- Privacy full-stack: `11/11` passed.
- Production preflight: `8/8` passed with `liveProbes=NOT_RUN`.
- Staging configuration isolation check: passed.
- Secret scan working tree and history: passed. History scan covered `4,924` blobs with no new unreviewed secrets.
- i18n symmetry, audit, hardcoded text, and auth-locale checks: passed.

## Local stress evidence

The reports are stored beside this document under `reports/p0/`.

- `limited-beta.json`: passed on commit `6db7b38`, with zero unexpected 4xx, zero 5xx, zero timeouts, read P95 `80.45ms`, and authentication P95 `726.5ms`.
- `capacity.json`: failed the local sample-floor gate at `ramp-32` with `692/1280` requests, floor `960`. It produced zero unexpected 4xx, zero 5xx, and zero timeouts, but this does not satisfy the capacity gate. The run is local-only and uses the single-instance D1 harness.

## Remaining release gates

- Browser E2E was not completed because the container could not download the Playwright Chromium binary. This is recorded as `NOT TESTED`, not `PASS`.
- Candidate deployment to isolated Cloudflare Staging was not performed here.
- Staging Access, dedicated secrets, real external provider sandboxes, backup/restore, rollback, monitoring, and alerting still require execution in an authorized non-interactive deployment environment.
- The production domain was not touched.

The code candidate is ready for Gemini to deploy to isolated Staging and repeat the public HTTP acceptance matrix. Production and public-beta approval remain conditional on the remaining live gates.
