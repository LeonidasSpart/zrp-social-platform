import { NextResponse } from "next/server";

// Serves the Apple-required Universal Links association file at
// https://zrp.one/.well-known/apple-app-site-association. Current Apple
// documentation only specifies this location (the legacy, no-".well-known"
// root path was for pre-iOS-9 devices and is not replicated here - this
// app's deployment target is well above that).
//
// Apple's CDN fetches this unauthenticated, follows no redirect, and
// expects a JSON body (a .json extension is NOT used - that is
// deliberate per Apple's own spec, not an oversight). This route must
// stay reachable through src/middleware.ts without a session or any
// other gate - see the allow-path added there alongside this file.
//
// The app's half of Universal Links is real and complete:
// ZRPSocial.entitlements declares (once the association below is
// genuinely live) `applinks:zrp.one`, and DeepLink.swift maps every
// zrp.one path this app has a screen for. What this route supplies is
// the other half of the handshake Apple requires before it will ever
// trust that entitlement: proof, hosted on zrp.one itself, that the
// domain's owner authorizes a specific app (identified by
// "<TeamID>.<BundleID>") to handle its links.
//
// The one piece this repository cannot supply is the Team ID - there is
// no Apple Developer account for this app yet (see
// ZRPSocial.entitlements's own note). Rather than commit a guessed or
// placeholder Team ID - which Apple would simply never match against any
// real app, while looking "done" to a reader who does not check - this
// route reads APPLE_TEAM_ID at request time. That env var is not new:
// it already exists for Sign In with Apple's backend JWT client-secret
// generation (src/lib/apple-client-secret.ts, documented in README.md's
// Configuration section) and names the exact same Apple-assigned value -
// a Developer account has exactly one Team ID, used everywhere Apple
// asks for one. Reusing it here means the one external value this file
// is missing arrives for free the moment Sign In with Apple's own setup
// supplies it; no second "team ID" env var to keep in sync.
//
// Unset (true in every environment today, since neither integration has
// a real Apple Developer account behind it yet), this serves a validly-
// formed AASA that claims zero apps, which is the correct, honest "not
// configured yet" response: Apple's spec treats an empty `apps`/`details`
// list as "no app claims this domain," not as an error. The only change
// needed once a real Team ID exists is that one environment variable -
// no code change, no redeploy of this file's logic.
const BUNDLE_ID = "one.zrp.social";
const TEAM_ID_RE = /^[A-Z0-9]{10}$/;

function buildAasaBody() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();

  if (!teamId || !TEAM_ID_RE.test(teamId)) {
    if (teamId) {
      // Set but malformed is worth a loud signal, same posture as
      // Tools/validate-signing-readiness.py's team-ID shape check - a
      // typo'd value here would otherwise silently keep Universal Links
      // dead with no indication why.
      console.error(
        `apple-app-site-association: APPLE_TEAM_ID is set but not shaped like a real ` +
          `Apple Developer Team ID ('${teamId}'). Serving the "no apps claim this domain" ` +
          "response until it is corrected.",
      );
    }
    return { applinks: { apps: [], details: [] } };
  }

  const appID = `${teamId}.${BUNDLE_ID}`;
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID,
          appIDs: [appID],
          paths: [
            // Never hand API requests or this association file itself to
            // the app - neither is ever a link a person taps.
            "NOT /api/*",
            "NOT /.well-known/*",
            "*",
          ],
        },
      ],
    },
  };
}

export async function GET() {
  return NextResponse.json(buildAasaBody(), {
    headers: {
      // Apple's own fetcher does not require this, but every
      // documented example serves it, and it keeps the body from ever
      // being misread as plain text by an intermediate proxy.
      "Content-Type": "application/json",
      // Short-lived: once a real APPLE_TEAM_ID is set, the correct file
      // should be visible within a minute, not stuck behind a long CDN
      // cache that only clears on redeploy.
      "Cache-Control": "public, max-age=60",
    },
  });
}
