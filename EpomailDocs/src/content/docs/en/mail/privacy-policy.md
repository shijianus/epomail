---
title: Privacy Policy
description: EpoCanvas Mail Privacy Policy — what we collect, how we use and protect your data, when and with which third parties it is shared, and what controls you have over it.
---

# Privacy Policy

**Effective date: September 27, 2026　|　Version: 1.0**

EpoCanvas Mail (the "Service" or the "Software") is an **open-source email service** built on the Cloudflare stack (Workers, D1, KV, R2) and released under the MIT License. It can run as a public hosted mailbox site (for example `mail.epocanvas.com`) or be self-hosted by anyone as a private email service.

The purpose of this policy is simple: **to explain in plain language where your data goes, who can see it, and what you can do about it.** We run no ads, no tracking, and no data sales — every section below spells out exactly what that sentence means.

:::note[30-second summary]
- **What we collect**: your email address, your password (stored only as a salted hash — nobody, including the operator, can recover your original password), the email content and attachments you send and receive, and your login IP and device information.
- **What we never do with it**: no ad targeting, no selling to third parties, no analytics or tracking SDKs of any kind.
- **Who is responsible**: the operator of the instance you use is the "data controller" of your data. EpoCanvas Mail, as open-source software, collects and uploads nothing by itself.
- **You can always**: export all your email (JSON), delete messages and your account, enable two-factor authentication, and revoke third-party app grants.
- **Third parties to know about**: when you click "Translate", email text is sent to the AI translation service your instance is configured with; when the operator enables outbound delivery, external mail is sent via Resend or Mailjet. See [Section 6](#6-third-party-services-and-data-sharing).
:::

## 1. Who this policy applies to

"EpoCanvas Mail" has two identities — first work out which one you are dealing with:

| Identity | Who | Privacy role |
| --- | --- | --- |
| **The open-source software** | The source code repository published under the MIT License on GitHub | The software itself **collects and reports nothing** — zero telemetry, zero analytics, zero ad SDKs built in |
| **The instance you use** | The person or team running a given EpoCanvas Mail site (for example, the operator of the hosted site `mail.epocanvas.com`, or a site your company or community self-hosts) | The **data controller** of your data, legally responsible for collection purposes, retention, and deletion responses |

:::tip[One sentence]
The software is a tool; the operator is "we". Whichever site you registered on, that site's operator is responsible for your data under this policy (or their adapted version of it).
:::

Self-hosters may adopt this policy directly as their site's privacy statement, replacing contact and operational details per [Section 13](#13-self-hosting-operator-guide).

## 2. Information we collect

Grouped by how the information enters the system.

### 2.1 Information you provide

- **Email address**: your account identifier (e.g. `you@example.com`). The username defaults to the local part of the address and, if already taken on the same site, falls back to the full email address.
- **Password**: stored only as a **PBKDF2-HMAC-SHA256 hash (100,000 iterations + a unique random salt per user)**. This is a one-way transform — even the operator cannot recover your original password from the database.
- **Two-factor credentials (optional)**: if you enable TOTP, the secret is stored encrypted with AES-256-GCM; backup codes are stored as SHA-256 hashes only; if you register a passkey, only the public key is stored.
- **Profile details (optional)**: display name, avatar, bio, and similar. Avatar images are uploaded to the image storage service configured by the operator.

### 2.2 Your email content

The messages you send and receive through the Service — sender, recipients, subject, body, timestamps and other metadata, together with the labels, stars, read states and snoozes you apply — are stored in the instance's database and object storage. Attachments are stored in Cloudflare R2, an operator-configured S3-compatible store (such as Backblaze B2), or as a fallback in KV.

### 2.3 Technical information collected automatically

- **Registration and login records**: each registration and login records your IP address and browser User-Agent, from which the operating system, browser and device type are parsed. These are used for security auditing (e.g. spotting unusual sign-ins) and quota control.
- **Session tokens**: after sign-in, a JWT (valid for 30 days) is stored in your browser's localStorage. The Service **does not use cookies** and there are no cross-site tracking cookies.
- **Request metadata**: the underlying infrastructure (Cloudflare) processes requests across its edge network and may log connection metadata and runtime logs under its own policies.

### 2.4 What we deliberately do not collect

This list matters as much as the one above:

- ❌ **No ad tracking**: no ad SDKs, no behavioral profiling, no cross-site cookies.
- ❌ **No third-party analytics**: no Google Analytics, no Plausible, no event tracking of any kind.
- ❌ **No data sales**: your data is never sold, rented, or traded for advertising — under any circumstances.
- ❌ **No phone-home**: the open-source software never "reports back" instance data to the upstream authors or anyone else. Data on a deployment you run stays entirely inside your own Cloudflare account.

## 3. Where your data goes: one diagram

![EpoCanvas Mail data-flow diagram: your browser reaches the Cloudflare Worker over HTTPS; email content is stored in the D1 database, KV and R2 object storage; outbound mail is delivered via Resend or Mailjet; Telegram push and AI translation happen only when enabled or triggered by you](/images/mail/data-flow.svg)

*Figure: your email data rests inside the Cloudflare account of you (or your operator). Only the three switched channels on the right — outbound delivery, push notifications, and AI translation — ever send data out of the instance, each with a clear trigger; see Sections 6 and 7.*

## 4. How we use information

| Purpose | Information relied on | Notes |
| --- | --- | --- |
| Delivering the mail service | Email address, message content, attachments | The core function; the service cannot work without it |
| Account and security protection | Password hash, login IP/UA, TOTP/Passkey | Unusual sign-in detection and lockout (5 consecutive failures lock sign-in for 12 hours) |
| Verification-code extraction (optional) | Subject and body snippet of newly received mail | When enabled by the operator, Workers AI extracts verification codes for one-tap copying |
| System announcements | Email address, language preference | Official welcome mail and site-wide announcements are delivered in your interface language |
| Spam protection | Sender address, message content | Operators can configure blocklists and filter rules; the spam quarantine is auto-cleaned after 7 days |
| Storage quota management | Attachment sizes, mailbox usage | Prevents a single user from exhausting shared resources |

We do **not** use your information for automated decision-making, profiling, or any commercial purpose unrelated to the Service.

## 5. Storage, encryption, and security

### 5.1 Where data lives

All data is stored inside the instance operator's own Cloudflare account: structured data (users, messages, settings) in D1 (SQLite), caches and sessions in KV, and attachments in R2 or an S3-compatible store. The upstream authors of EpoCanvas Mail **hold no data and have no access** to any instance.

### 5.2 Encryption across the three mail modes

The Service offers three storage modes, chosen by the operator:

| Mode | How messages are stored | Who can read your mail |
| --- | --- | --- |
| **All-mail mode** | Stored in plaintext | The operator (administrators) can read every user's mail |
| **Privacy mode** (default) | Normal mail encrypted at rest with AES-256-GCM | Administrators can only touch spam, deleted, and unassigned mail — they cannot browse your normal inbox |
| **Encrypted mode** | Everything is encrypted, including Trash | Administrative mail-management endpoints return no user mail at all |

:::caution[An honest note on the limits of the encryption]
The above is **server-side encryption at rest**: the keys are derived from environment variables on the instance's server plus your user ID. This means **an operator who controls the server and the keys is technically capable of decryption** — it protects against scenarios like the database file being stolen or a snapshot leaking, and is **not** end-to-end encryption (E2EE); the operator is not absolutely unable to read your mail. If you need privacy that even the operator cannot breach, do not rely on any mailbox's encryption mode — encrypt the message body yourself with a dedicated E2EE tool (such as GPG) before sending.
:::

### 5.3 Transport and access security

- The whole site is served over HTTPS/TLS; sensitive endpoints such as sign-in have rate limiting and failure lockout.
- Two-factor authentication: TOTP (RFC 6238) and FIDO2 passkeys (fingerprint / face) are supported and strongly recommended.
- Session management: at most 10 concurrent sessions per account; you can sign out on any device and the token is revoked immediately.
- Administrator powers (disclosed honestly): depending on role permissions, instance administrators can reset user passwords, force-reset two-factor authentication, ban or delete accounts, view users' registration IPs and device lists, and — in "All-mail mode" — read user mail. **Choosing an instance means trusting its operator**; take it as seriously as choosing an email provider.

## 6. Third-party services and data sharing

Our principle: **data that does not need to leave, never leaves; and for data that must, the table below lists exactly which door it goes through and what it carries.**

| Third party | Role | When triggered | What is shared |
| --- | --- | --- | --- |
| **Cloudflare** | Infrastructure (runtime, D1/KV/R2 storage, Email Routing, human verification, Workers AI, logs) | Always | Request metadata, stored content, verification requests |
| **Resend / Mailjet** | Outbound delivery providers | Only when you send mail to recipients outside the instance and the operator has configured a delivery channel | The full message (recipients, subject, body, attachments) |
| **Telegram** | Instant push notifications | Only when you (or the operator) have linked a Telegram bot and enabled push | Configurable: subject, sender (can be hidden), body (can be hidden), verification codes, a mail-view link (valid 7 days) |
| **AI translation providers** (the instance's configured relay endpoint, Cloudflare Workers AI, MyMemory, the public Google Translate endpoint) | Translation processing | **Only when you click "Translate"** | The mail text being translated (the full passage where possible; clipped fragments in fallback scenarios); images for OCR translation |
| **Image upload service** | Avatar and image storage | Only when you upload an avatar or similar | The image file itself |
| **Linux DO** | Third-party sign-in identity | Only when you sign in with a Linux DO account | The OAuth exchange returns your user ID, name, avatar, and trust level |
| **Google Fonts** | Interface font loading | When your browser loads the page | Font requests (your IP appears in Google's request logs) |
| **Your/operator-configured S3, Turso, etc.** | External storage | Only when external storage/database is configured | Attachments or data copies |

:::tip[What "we don't sell data" concretely means]
None of the parties above receives your data for advertising purposes, and we have no data-sale or ad-revenue arrangement with any of them. Some (such as Cloudflare and Resend) process data as "processors" on the operator's instructions, each governed by its own privacy policy (available on their websites).
:::

## 7. AI features

The Service ships three AI capabilities; triggers and data boundaries are as follows:

1. **Verification-code extraction** (operator-optional): when a new message arrives, the system sends the subject and the first 6,000 characters of the body to Cloudflare Workers AI to extract the verification code, so you can copy it from the list or a Telegram notification. This is the only AI processing that happens **without a manual trigger** — if you do not want it, ask the operator to disable it or choose an instance without it.
2. **Mail AI translation** (triggered by you): clicking "Translate" sends the mail text, chunked, to the large-model endpoint configured on the instance (OpenAI-compatible by default) with multi-model failover; when models are unavailable, the MyMemory or public Google Translate endpoint is used as a fallback. **No click, no transfer.**
3. **Image OCR translation** (triggered by you): images containing text are recognized and translated; the image is sent to the AI providers above. Decorative images, logos, and icons are skipped automatically and never leave the instance.

The AI features are not connected to model training: the system does not use your mail to train any model, and sends the AI providers no user identity beyond the text needed for translation.

## 8. Retention and deletion

| Data | Retention |
| --- | --- |
| Mail in the normal inbox | Kept until you delete it, or until quota-driven cleanup |
| Spam | Quarantined for **7 days**, then moved to Trash |
| Trash mail | **Physically deleted** (binary attachments and index included) by the daily routine **7 days after receipt** |
| Mail of a deleted account | Self-service deactivation is a **soft delete**: mail stays in the database (technically recoverable) until an administrator physically deletes it; after a physical deletion, profile, mailboxes, messages, attachments, OAuth grants and sessions are removed for good |
| Login records (IP/UA) | Kept in the user profile until the account is physically deleted |
| Session tokens | Revoked server-side on sign-out; expire naturally after 30 days of inactivity |

:::caution[Export before you delete]
Physical deletion is unrecoverable. To take your data with you, use "Settings → Data Export" first to download a JSON copy (your full profile and the complete bodies of all non-deleted messages).
:::

## 9. Your controls and rights

Whatever jurisdiction you are in, the Service builds these self-service tools in:

- **Data portability**: one-click export of your full profile and all messages (JSON, human-readable) from the settings page.
- **Erasure**: delete individual messages (physically cleared after 7 days), deactivate your account yourself, or ask the operator for immediate physical deletion.
- **Access and correction**: view and edit your display name, avatar, language preference, and mail preferences in settings at any time.
- **Public profile switch**: your public profile page is visible only to you and administrators by default. When enabled, your email address, display name, avatar, registration date, and send/receive statistics become publicly visible — **entirely your choice**.
- **Third-party grant management**: review every OAuth grant under "Third-party apps" and revoke any of them with one click; the corresponding access token dies immediately.
- **Session management**: sign out on any device to revoke that device's token.
- **Objection and opt-out**: turn Telegram push off, avoid AI transfers by never clicking Translate, or choose an instance without verification-code extraction.

If your jurisdiction (EU/EEA, UK, California, etc.) grants you additional statutory rights (complaints, restriction of processing, etc.), contact the instance operator to exercise them; the operator is obliged to respond within statutory deadlines.

## 10. Communications and notifications

The Service itself sends you no marketing mail. The only official mail you may see inside the product is the welcome message and site-wide announcements from the operator (both delivered in-product by the official account `admin@epocanvas.com`, never through an external service), plus ordinary mail written to you by external senders. Telegram push and forwarding to other mailboxes are off by default and can be turned off at any time.

## 11. Children and minors

The Service is not directed at children under 14, and operators do not knowingly collect children's personal information. If you are a guardian and believe your child has provided personal information, contact the instance operator and it will be deleted promptly upon verification. Self-hosting operators should set a higher minimum age according to their jurisdiction and audience.

## 12. International data transfers

The Service is built on Cloudflare's global edge network. Data may be stored in the Cloudflare region chosen by the operator (D1/KV/R2 support location selection) and may transit any edge location worldwide — meaning data may be processed outside the operator's own country. Cloudflare provides transfer safeguards under its compliance frameworks (such as Standard Contractual Clauses under the GDPR); see Cloudflare's official compliance documentation for details. Using a hosted instance means you understand and accept this infrastructure characteristic.

## 13. Self-hosting operator guide

If you have deployed EpoCanvas Mail under your own domain, then legally and factually **you are the "we" for your users**. Please:

1. **Replace the placeholders in this file**: contact email, instance name, effective date — and review the third-party table in Section 6 (if you have not configured Telegram or Resend, delete those rows).
2. **Choose and disclose your mail mode honestly**: the All/Privacy/Encrypted mode you pick directly determines whether the wording of Section 5.2 holds true.
3. **Meet your jurisdiction's obligations**: if your users fall under the GDPR (EU), UK, LGPD (Brazil), CCPA/CPRA (California), and similar, you may need to add lawful bases, a DPA, statutory retention periods, and local complaint channels. This file is a solid engineering starting point, **not legal advice** — consult a qualified lawyer before going live.
4. **Keep the zero-telemetry promise**: your deployment inherits the "no analytics, no reporting" foundation by default; if you add third-party analytics yourself, disclose it honestly in your privacy policy.

## 14. Changes to this policy

This policy may be updated as features evolve. Material changes (a new third party, changed retention, a changed encryption mode, etc.) will be announced in advance via in-site announcement or system mail, with the "Effective date" and version number updated at the top of this page. Continued use after an update constitutes acceptance; if you disagree after a material change, you may stop using the Service and export or delete your data.

## 15. Contact us

- **Hosted instance (`mail.epocanvas.com`)**: contact the operator via in-product mail or email: `admin@epocanvas.com`.
- **The open-source software itself**: open an issue on the project's GitHub repository.
- **Self-hosted sites**: contact the operator of the site you use (contact details should be published on that site).

## Appendix A: relationship to the open-source project

EpoCanvas Mail is built on and continues as an open-source project released under the MIT License. The upstream original project was created by **eoao** (Copyright (c) 2025 eoao) — thanks to upstream and all contributors. This policy was written by the EpoCanvas community and is released in the same open spirit: **any operator of an EpoCanvas Mail instance may freely adopt and adapt this text** (MIT spirit, no attribution required), though we recommend keeping the self-hosting statement in Section 13 to preserve the same transparency toward your users.
