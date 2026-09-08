# Security Policy

ZRP Social handles personal messages, media, account credentials and
payment-adjacent data. Security reports are taken seriously, and this
document describes how to report an issue responsibly.

## Reporting a vulnerability

Report suspected vulnerabilities by email to:

**security@zrp.one**

This is the same address published on the ZRP contact page
(`src/app/contact/page.tsx`).

**Do not open a public GitHub issue, pull request, discussion or comment
that contains vulnerability details.** Anything filed publicly is visible
to everyone, including before a fix exists. If you have already opened a
public report, email the address above so it can be handled properly, and
avoid adding further detail in the public thread.

The regular support channels (`/support`, `/contact`) are appropriate for
account problems and abuse reports, but not for undisclosed vulnerability
details.

## What to include

A report is easiest to act on when it contains:

- A description of the vulnerability and the impact you believe it has.
- The affected surface — the web application, the API (`src/app/api/**`),
  the native Android app (`android-native/`), the native iOS app
  (`ios-native/`), the Capacitor shells (`android/`, `ios/`), or the
  realtime server (`server.js`).
- The affected URL, route or endpoint, and the app version or commit if
  you know it.
- Step-by-step reproduction instructions, and a minimal proof of concept
  if you have one.
- What an attacker could achieve — for example reading another user's
  private data, acting on their behalf, bypassing an authorisation check,
  or escalating to admin.
- Any logs, request/response captures or screenshots that help, with
  other people's personal data removed.

If you are not sure whether something is a vulnerability, report it
anyway and say what you are unsure about.

## Responsible disclosure

We ask that you:

- Give us a reasonable opportunity to investigate and remediate before
  disclosing the issue publicly or to third parties.
- Do not access, modify, exfiltrate or retain data belonging to anyone
  other than yourself. If you encounter personal data while testing,
  stop, do not save it, and say so in your report.
- Do not degrade the service. No denial-of-service testing, no load or
  stress testing, no spam, and no automated scanning that generates
  significant traffic against production.
- Do not use social engineering, phishing, or physical attacks against
  ZRP users, contributors or infrastructure providers.
- Use only your own test accounts.

In return, we will acknowledge reports we receive at the address above,
investigate them, and keep the reporter informed about the outcome where
a contact address is available.

## What is out of scope

The following are generally not treated as vulnerabilities on their own:

- Findings from automated scanners without a demonstrated impact.
- Missing security headers with no demonstrated exploit path. The
  headers currently set are in `next.config.js`; the absence of a
  Content-Security-Policy there is a known, documented decision rather
  than an oversight.
- Reports about third-party services or dependencies that are not
  exploitable through ZRP. Please report those to the upstream project,
  and tell us if ZRP is affected.
- Rate limits, spam or abuse-handling opinions with no security impact —
  use the in-product reporting flows instead.
- Vulnerabilities that require a rooted, jailbroken or otherwise
  attacker-controlled device on which the attacker is already the user.

## What we do not offer

ZRP does not currently operate a paid bug bounty programme, and no
monetary reward is offered or implied for a report.

No response, triage or remediation time is committed here. Nothing in
this document is a service-level agreement.

## Coordinated disclosure of a fix

Once a reported issue is remediated, we may publish a description of the
issue and the fix. Reporters who wish to be credited should say so in
their report; we will not name a reporter without their agreement.

## Handling of secrets

No credential, key, token or certificate belongs in this repository.
`.gitignore` excludes environment files and signing material (`*.jks`,
`*.keystore`, `*.p8`, `*.p12`, `keystore.properties`), and production
configuration is supplied at runtime through environment variables.

If you believe a secret has been committed, treat it as a security
report: email **security@zrp.one** rather than filing it publicly, so it
can be rotated before attention is drawn to it.
