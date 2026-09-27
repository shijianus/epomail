---
title: Terms of Service
description: EpoCanvas Mail Terms of Service — account rules, acceptable use boundaries, content rights, disclaimers, and the open-source license notes you should know before using the mail service.
---

**Effective date: September 27, 2026　|　Version: 1.0**

Welcome to EpoCanvas Mail (the "Service"). These terms are the agreement between you and the operator of the Service concerning your use of it. Please take a few minutes to read them — we have kept the language as plain as possible and cover, in one place, what you may do, what you may not do, and what happens when things go wrong.

:::note[30-second summary]
- **What the Service is**: an open-source (MIT-licensed), self-hostable, full-Cloudflare email service; you can use it to send and receive mail, manage multiple mailboxes, and exchange attachments.
- **Your account, your responsibility**: keep your password safe and enable two-factor authentication; 5 consecutive failed sign-ins lock the account for 12 hours.
- **The bottom line**: no spam, no illegal content, no attacks on the service or on others. Violations can lead to bans and account deletion.
- **Your mail belongs to you**: we process it only to deliver and store it. Trash is physically cleared 7 days after deletion — export before you say goodbye.
- **The Service is provided "as is"**: open-source software, best-effort availability, no service-level agreement (SLA).
- **Unfamiliar wording?**: jump to the [Appendix: quick glossary](#appendix-quick-glossary) at the end for plain-language explanations of the key terms.
:::

## On this page

1. [Scope and definitions](#1-scope-and-definitions)
2. [Service overview](#2-service-overview)
3. [Accounts and security](#3-accounts-and-security)
4. [Acceptable use policy](#4-acceptable-use-policy)
5. [Your content and license](#5-your-content-and-license)
6. [Outbound delivery and third-party services](#6-outbound-delivery-and-third-party-services)
7. [Availability and changes](#7-availability-and-changes)
8. [Retention and account termination](#8-retention-and-account-termination)
9. [Force majeure](#9-force-majeure)
10. [Disclaimer of warranties (AS-IS)](#10-disclaimer-of-warranties-as-is)
11. [Limitation of liability](#11-limitation-of-liability)
12. [Indemnification](#12-indemnification)
13. [Intellectual property and the open-source license](#13-intellectual-property-and-the-open-source-license)
14. [Terms for self-hosting operators](#14-terms-for-self-hosting-operators)
15. [Changes to these terms](#15-changes-to-these-terms)
16. [Contact us](#16-contact-us)

- [Appendix: quick glossary](#appendix-quick-glossary)

## 1. Scope and definitions

- **"The Service"**: all functionality running on a given EpoCanvas Mail instance, including the web app, the open API, and related components.
- **"Operator / we"**: the individual or team that has deployed and runs the instance you use. For the hosted instance `mail.epocanvas.com`, that is the EpoCanvas operations team; for a self-hosted instance, it is whoever deployed it.
- **"You"**: any natural person or organization that registers, signs in, or otherwise uses the Service.
- **Dual-track applicability**: EpoCanvas Mail is open-source software and anyone may deploy their own instance. These terms are a **general template**: hosted instances apply them directly, and self-hosting operators may adapt them as their site's terms. Wherever you register, you form the agreement with that site's operator.
- **Additional terms**: when you use third-party features (outbound delivery, AI translation, Telegram, Linux DO sign-in, etc.), you also agree to the respective third party's terms (see [Section 6](#6-outbound-delivery-and-third-party-services)); privacy matters are governed by the [Privacy Policy](/en/mail/privacy-policy/).

## 2. Service overview

![EpoCanvas Mail responsibility-boundary diagram: the upstream open-source project (MIT license) provides the source code; the instance you use is operated independently and its operator bears the responsibility; your account and mail data live in that instance's Cloudflare resources](/images/mail/self-host-responsibilities.svg)

*Figure: the upstream authors of the open-source software run no email service and are not responsible for any instance's conduct; there is no service contract between you and upstream.*

The Service includes: multi-mailbox management, internal and external mail, attachments, labels and stars, spam quarantine, snoozes, search, AI translation (optional), verification-code recognition (optional), Telegram push (optional), two-factor authentication (TOTP/Passkey), an OAuth platform, and data export. Actual features depend on what your instance has enabled.

**The open-source identity**: the Service is built on and continues an open-source project released under the MIT License. That means: the source code is public and auditable; you can deploy it yourself to get the same capabilities; and the software is provided "as is" (see Section 10).

## 3. Accounts and security

1. **Truthful registration**: signing up only requires a valid receiving email address and a password. Do not impersonate others or use domains you have no right to use.
2. **Credential custody**: you are responsible for your password, two-factor credentials, and API tokens. Actions performed with your credentials are deemed your own.
3. **Two-factor authentication**: TOTP or passkeys are strongly recommended. On instances running "Encrypted mail mode", the operator may require two-factor authentication under its security policy.
4. **Sign-in protection**: 5 consecutive password failures lock sign-in for 12 hours; an account keeps at most 10 active sessions, and you can sign out on any device to revoke its token immediately.
5. **Reserved names**: identifiers such as `admin` are reserved by the system and cannot be registered by regular users.
6. **Registration keys**: operators may configure the instance to require a registration key or to close registration — that is the instance's own managerial right.
7. **Eligibility**: you must meet the minimum age stated in Section 11 of the [Privacy Policy](/en/mail/privacy-policy/) and make sure your registration and use comply with the laws that apply to you.

## 4. Acceptable use policy

### 4.1 You agree not to use the Service to

**Unlawful and harmful conduct**

- Send, store, or distribute content that violates the laws of your or the operator's jurisdiction, including but not limited to: child sexual abuse material (zero tolerance — found means deleted and reported as required by law), violent extremism, drug and weapons trafficking, fraud, and phishing pages;
- Distribute malware, viruses, or ransomware, or send mail designed to steal credentials.

**Spam and abuse**

- Send unsolicited bulk commercial email (spam / UBE / UCE), marketing to recipients who have not consented, or use the Service for mailbox warm-up or bulk address-verification bombing;
- Register accounts programmatically in bulk, circumvent human verification (Turnstile), registration keys, or quota limits;
- Use the Service as an anonymous relaying hop or a short-lived throwaway spam pool, or re-register repeatedly to evade enforcement.

**Attacks and interference**

- Scan, probe, or brute-force this Service or third-party systems; attempt to gain unauthorized access to other people's mailboxes, administrative endpoints, or other users' data;
- Consume AI translation, attachments, the API, or other shared resources to the point of degrading other users' normal use;
- Harass, defame, or engage in legal harassment against Cloudflare or the upstream open-source community.

**Infringement**

- Infringe others' intellectual property, privacy, or publicity rights; spoof sender identities to impersonate people or organizations;
- Breach third-party terms of service (Cloudflare, Resend, Mailjet, Telegram, etc.).

### 4.2 Consequences

Depending on the nature and severity of the violation, the operator may: warn → rate-limit features → quarantine to spam → suspend the account → physically delete the account and all its data. Where unlawful conduct is involved, the operator may retain necessary evidence and cooperate with competent authorities. If your conduct causes the operator to be penalized by Cloudflare or an upstream provider, the operator reserves the right to seek recovery from you (see Section 12).

### 4.3 Appeals and reporting

If you believe enforcement was mistaken, contact the operator through the channels in [Section 16](#16-contact-us); the operator will review and reply within a reasonable time. We also welcome reports of others' violations or security concerns (spam sources, phishing pages, unauthorized access attempts) — good-faith reports are all handled seriously; content suspected to be unlawful (above all child sexual abuse material) will be reported to the competent authorities as required by law.

## 5. Your content and license

1. **Ownership is yours**: the mail you send and receive, and its attachments, belong to you, and so does the responsibility for them. The operator will not use your content for advertising, model training, or transfer to anyone.
2. **A limited processing license**: to provide storage, delivery, search, push, and (optional) translation, you grant the operator a technical processing license **strictly limited to operating the Service**. When you stop using the Service and your data is deleted, the license ends.
3. **You are responsible for what you send**: every message you send speaks for you. Disputes and liability arising from your sent content are yours.
4. **The boundary of content review**: the operator does not proactively review your normal mail; but in "All-mail mode" instances administrators can technically read all mail (in Privacy mode, only spam/deleted/unassigned mail), and will act on reports or lawful requests. Understand an instance's mode before choosing it.

## 6. Outbound delivery and third-party services

1. **Outbound delivery relies on third parties**: mail addressed outside the instance is delivered through the operator-configured channel (Cloudflare Email Workers, Resend, or Mailjet). Third-party delivery can be delayed, bounced, or blocked by the receiving provider; the operator does not guarantee outbound delivery outcomes.
2. **Optional features carry third-party terms**: Telegram push, AI translation, Linux DO sign-in, external S3 storage, and similar features are additionally governed by the respective third party's terms when you use them.
3. **The OAuth platform**: if you authorize a third-party app via OAuth, the scopes (openid / profile / email) and revocation controls are described in Section 9 of the Privacy Policy; the app's use of your data is governed by its own terms.

## 7. Availability and changes

- **Best effort, no SLA**: the Service runs on Cloudflare's free or metered edge infrastructure. The operator makes reasonable efforts to keep it available but does not promise 100% uptime, delivery times, or recovery deadlines.
- **Evolving features**: the open-source project iterates quickly; features may be added, changed, or removed. Material changes affecting data deletion will be announced in advance.
- **Maintenance and interruptions**: the operator may suspend part or all of the Service for upgrades, fixes, or abuse handling; outages caused by Cloudflare or upstream AI/delivery providers are not a breach by the operator.
- **Experimental features**: features labeled "experimental" or in testing (such as image OCR translation) are provided "as is", may be unstable, and can change or be withdrawn at any time — the risk of relying on them for critical work is yours.

## 8. Retention and account termination

1. **You end it**: you may deactivate your account in settings at any time, or ask the operator for deletion. Deactivation invalidates your sessions immediately; mail enters a recoverable soft-deleted state until an administrator performs the physical deletion.
2. **Routine cleanup**: spam quarantined for 7 days moves to Trash; Trash mail is physically deleted (attachments included) 7 days after receipt by the daily routine. **Deletion is unrecoverable — export a JSON copy via "Data Export" first.**
3. **The operator ends it**: if you breach [Section 4](#4-acceptable-use-policy), the operator may suspend or terminate your access and act per Section 4.2. Policies for long-inactive accounts are published by the operator.

## 9. Force majeure

Service interruptions and data loss caused by force majeure — natural disasters, war, government action, backbone network failures, large-scale cyberattacks, or the shutdown or policy changes of third-party providers (Cloudflare, Resend, Mailjet, Telegram, AI services, etc.) — are not the operator's liability where reasonable efforts have been made.

## 10. Disclaimer of warranties (AS-IS)

The Service (including its software) is provided **"as is" and "as available"**, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. This mirrors the disclaimer scope of the software's **MIT License**: **in no event shall the operator or the upstream open-source authors be liable for any claim, damages, or other liability arising from or in connection with the Service or its use.**

## 11. Limitation of liability

To the maximum extent permitted by law, the operator's aggregate liability to you shall not exceed the greater of: (a) the amount you actually paid the operator in the past 12 months (typically zero for free instances); (b) USD 100. The operator is not liable for indirect damages, loss of data, lost profits, or loss of goodwill. **Back up important mail elsewhere yourself.**

## 12. Indemnification

If your breach of these terms, infringement of others' rights, or unlawful conduct causes the operator, the upstream open-source authors, or their affiliates to face third-party claims (including penalties and complaint-handling costs from Cloudflare or other providers), you agree to indemnify and hold them harmless to the extent permitted by law.

## 13. Intellectual property and the open-source license

1. **Code license**: the software's source code is licensed under the **MIT License**, Copyright (c) 2025 eoao (upstream) and the contributors of this project. The MIT License governs the code itself; these terms govern use of the Service — neither replaces the other.
2. **Acknowledgment**: the Service is built on the upstream open-source project (author eoao) — thanks to upstream and the open-source community.
3. **Your content**: rights in the avatars, names, and other materials you upload remain with you or their original rights holders.
4. **Trademark courtesy**: if you keep the "EpoCanvas Mail" name and mark on your self-hosted instance, label it clearly as an independently deployed community instance so as to avoid confusion.

## 14. Terms for self-hosting operators

If you are the operator of a self-hosted instance:

- You carry full operator responsibility for your instance: enforcing acceptable use, handling user appeals, localizing the privacy policy and these terms, and meeting statutory retention and cooperation duties;
- You should copy, adapt, and publish this document on your site, replacing contact details and the responsible party;
- The upstream open-source authors and this project's maintainers **bear no joint liability for how you run your instance**;
- If you charge users, ensure compliance with local business, tax, and consumer-protection requirements yourself.

## 15. Changes to these terms

These terms may be revised as the Service evolves. Material changes will be announced via in-site announcement or system mail, with the effective date and version at the top of this page updated. Continuing to use the Service after a change takes effect constitutes acceptance; if you disagree, stop using it and export or delete your data. Past major revisions are archived in the open-source repository's version history and can be retrieved at any time.

## 16. Contact us

- **Hosted instance (`mail.epocanvas.com`)**: in-product mail or email to `admin@epocanvas.com`;
- **The open-source project**: issues on the GitHub repository;
- **Self-hosted sites**: the operator contact published on that site.

---

## Appendix: quick glossary

| Term | One-line explanation |
| --- | --- |
| **The Service / instance** | All functionality running on one EpoCanvas Mail deployment (web app, API, and components) |
| **Operator** | Whoever deployed and runs that instance — the "we" of these terms and the counterparty for your data and use |
| **Hosted / self-hosted** | Hosted = `mail.epocanvas.com`, run by the EpoCanvas team; self-hosted = an instance deployed by you or a third party |
| **Your content** | The mail, attachments, and profile you send, receive, and upload; ownership and responsibility are yours |
| **Processing license** | The limited technical permission you grant the operator so storage, delivery, search, push, and similar features can work (Section 5) |
| **Acceptable use policy** | The boundaries of allowed and forbidden conduct in Section 4, with the stepped consequences of Section 4.2 |
| **Soft delete / physical deletion** | Soft delete = flagged as deleted, recoverable by administrators; physical deletion = removed from storage together with attachments and index, unrecoverable |
| **SLA** | Service-level agreement (uptime and response commitments); this Service is best-effort with no SLA |

---

*These terms, together with the [Privacy Policy](/en/mail/privacy-policy/), form the complete agreement between you and the operator. This document is a general template written by the open-source community and is not legal advice; operators should consult a qualified lawyer before commercial use.*
