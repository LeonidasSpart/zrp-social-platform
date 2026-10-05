#!/usr/bin/env python3
"""
Pre-flight check for a REAL signed archive/export of ZRP Social iOS.

This exists because `xcodebuild archive` without a team produces a wall of
Xcode's own signing diagnostics ("No profiles found", "Signing for
\"ZRPSocial\" requires a development team", sometimes a dozen lines deep in
a build log) that someone unfamiliar with this project would have to
decode from scratch. CI's own build/archive job never hits this - it
explicitly passes CODE_SIGNING_ALLOWED=NO (see .github/workflows/
ios-native-build.yml), so it has never needed a team.

The project is deliberately architected so that a signed archive needs
exactly ONE external input this repository cannot supply: a real Apple
Developer Program Team ID. CODE_SIGN_STYLE is already "Automatic" in
project.pbxproj (both Debug and Release), and Signing/ExportOptions.plist
deliberately omits `teamID` rather than guess one - see that file's own
header comment. Nothing else needs to change when the team ID exists;
this script is the one thing to run first once it does.

Usage (from ios-native/):
    DEVELOPMENT_TEAM=ABCDE12345 python3 Tools/validate-signing-readiness.py

or pass it directly:
    python3 Tools/validate-signing-readiness.py --team ABCDE12345

Exits 0 and prints the exact xcodebuild invocation to run next if every
prerequisite this repo can check is satisfied. Exits 1 with a specific,
actionable reason - never a generic failure - otherwise. This script never
invents, stores, or echoes a credential; it only checks that one was
supplied and that the committed configuration around it is consistent.
"""

from __future__ import annotations

import argparse
import os
import plistlib
import re
import sys

IOS_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PBXPROJ = os.path.join(IOS_ROOT, "ZRPSocial.xcodeproj", "project.pbxproj")
EXPORT_OPTIONS = os.path.join(IOS_ROOT, "Signing", "ExportOptions.plist")
ENTITLEMENTS = os.path.join(IOS_ROOT, "Supporting", "ZRPSocial.entitlements")

TEAM_ID_RE = re.compile(r"^[A-Z0-9]{10}$")


def fail(reason: str, remedy: str) -> None:
    print(f"::error::{reason}", file=sys.stderr)
    print(f"  Remedy: {remedy}", file=sys.stderr)
    sys.exit(1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--team",
        default=os.environ.get("DEVELOPMENT_TEAM", ""),
        help="Apple Developer Program Team ID (10 alphanumeric characters). "
        "Falls back to the DEVELOPMENT_TEAM environment variable. Never read "
        "from a committed file - there is no such file in this repository.",
    )
    args = parser.parse_args()

    team = args.team.strip()

    # 1) The one external input this repo cannot supply.
    if not team:
        fail(
            "No Apple Developer Program Team ID supplied.",
            "This is the single blocker a signed archive needs that cannot be "
            "resolved inside this repository. Enroll in the Apple Developer "
            "Program for one.zrp.social, then re-run this script as "
            "`DEVELOPMENT_TEAM=<your 10-character team id> python3 "
            "Tools/validate-signing-readiness.py`. Do not invent or guess an "
            "ID - an invalid one produces a confusing signing failure deeper "
            "in the Xcode build, not a clean error here.",
        )
    if not TEAM_ID_RE.match(team):
        fail(
            f"'{team}' is not shaped like a real Apple Developer Team ID "
            "(10 alphanumeric characters, e.g. ABCDE12345).",
            "Copy the Team ID exactly as shown in developer.apple.com -> "
            "Membership, or in Xcode's Signing & Capabilities tab once "
            "signed in with the real account.",
        )
    print(f"OK: Team ID '{team}' has the expected shape.")

    # 2) The committed project side: CODE_SIGN_STYLE must still be
    # Automatic for every config that matters, or this validation (and the
    # ExportOptions.plist signingStyle below) would be checking the wrong
    # thing against a project that quietly switched to manual signing.
    if not os.path.isfile(PBXPROJ):
        fail(f"project.pbxproj not found at {PBXPROJ}.", "Run this script from a full checkout of ios-native/.")
    with open(PBXPROJ, encoding="utf-8") as f:
        pbxproj_text = f.read()

    sign_styles = re.findall(r"CODE_SIGN_STYLE\s*=\s*(\w+);", pbxproj_text)
    if not sign_styles:
        fail(
            "No CODE_SIGN_STYLE setting found in project.pbxproj.",
            "The project configuration has changed since this script was written - "
            "update it (or re-add CODE_SIGN_STYLE = Automatic;) rather than skip this check.",
        )
    non_automatic = sorted(set(sign_styles) - {"Automatic"})
    if non_automatic:
        fail(
            f"project.pbxproj has CODE_SIGN_STYLE values other than Automatic: {non_automatic}.",
            "This script only validates the automatic-signing path this project uses today. "
            "If manual signing was deliberately introduced, this script needs updating "
            "alongside it, not bypassing.",
        )
    print(f"OK: CODE_SIGN_STYLE is Automatic in all {len(sign_styles)} build configuration(s) that declare it.")

    bundle_ids = sorted(set(re.findall(r"PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([\w.]+);", pbxproj_text)))
    app_bundle_id = "one.zrp.social"
    if app_bundle_id not in bundle_ids:
        fail(
            f"Expected app bundle identifier '{app_bundle_id}' not found in project.pbxproj "
            f"(found: {bundle_ids}).",
            "Confirm the App ID you register in the Apple Developer portal matches "
            "PRODUCT_BUNDLE_IDENTIFIER exactly, or update this script if the bundle id changed.",
        )
    print(f"OK: app target bundle identifier is '{app_bundle_id}'.")

    # 3) ExportOptions.plist must be a valid app-store-connect automatic
    # export config with teamID still genuinely absent (not a placeholder
    # someone forgot to replace with a fake value).
    if not os.path.isfile(EXPORT_OPTIONS):
        fail(f"{EXPORT_OPTIONS} not found.", "Restore Signing/ExportOptions.plist from version control.")
    with open(EXPORT_OPTIONS, "rb") as f:
        try:
            export_options = plistlib.load(f)
        except Exception as exc:  # noqa: BLE001 - want the exact parser error surfaced
            fail(f"Signing/ExportOptions.plist is not a valid plist: {exc}", "Fix the plist syntax before archiving.")
            return 1  # unreachable, keeps type checkers happy

    if export_options.get("method") != "app-store-connect":
        fail(
            f"Signing/ExportOptions.plist 'method' is '{export_options.get('method')}', expected 'app-store-connect'.",
            "This script validates the App Store submission export path only.",
        )
    if export_options.get("signingStyle") != "automatic":
        fail(
            f"Signing/ExportOptions.plist 'signingStyle' is '{export_options.get('signingStyle')}', expected 'automatic'.",
            "Keep signingStyle in sync with CODE_SIGN_STYLE in project.pbxproj.",
        )
    existing_team_in_plist = export_options.get("teamID")
    if existing_team_in_plist and existing_team_in_plist != team:
        fail(
            f"Signing/ExportOptions.plist already has a committed teamID ('{existing_team_in_plist}') "
            f"that does not match the --team/DEVELOPMENT_TEAM value supplied ('{team}').",
            "A team ID should never be committed to this file (see its own header comment) - "
            "pass it at archive/export time instead, e.g. via -exportOptionsPlist plus "
            "-allowProvisioningUpdates, or DEVELOPMENT_TEAM=<id> on the archive step. "
            "If this file acquired a committed teamID by accident, remove it.",
        )
    print("OK: Signing/ExportOptions.plist is a valid automatic app-store-connect export config "
          "with no team ID hardcoded into version control.")

    # 4) Entitlements sanity: aps-environment still "development" is
    # expected (Xcode substitutes "production" from the distribution
    # profile at archive time - see the entitlements file's own comment).
    # A hand-edited "production" here would silently mean someone tried to
    # route around Xcode's substitution, which is a configuration smell
    # worth catching, not a hard failure.
    if os.path.isfile(ENTITLEMENTS):
        with open(ENTITLEMENTS, "rb") as f:
            entitlements = plistlib.load(f)
        aps_env = entitlements.get("aps-environment")
        if aps_env not in (None, "development"):
            print(
                f"::warning::Supporting/ZRPSocial.entitlements has aps-environment='{aps_env}', "
                "not the expected 'development' template value. Xcode normally substitutes "
                "'production' automatically from the distribution provisioning profile at "
                "archive time - a hand-edited value here may be overridden or may indicate "
                "an unintended manual change. Verify before archiving.",
            )
        else:
            print("OK: Supporting/ZRPSocial.entitlements aps-environment is the expected template value.")

    print()
    print("All repository-side signing prerequisites are satisfied.")
    print("Next step (run on a macOS machine with Xcode 26+ and this Team ID signed in):")
    print()
    print("  xcodebuild archive \\")
    print("    -project ZRPSocial.xcodeproj \\")
    print("    -scheme ZRPSocial \\")
    print("    -configuration Release \\")
    print("    -destination 'generic/platform=iOS' \\")
    print("    -archivePath build/ZRPSocial.xcarchive \\")
    print(f"    DEVELOPMENT_TEAM={team} \\")
    print("    -allowProvisioningUpdates")
    print()
    print("  xcodebuild -exportArchive \\")
    print("    -archivePath build/ZRPSocial.xcarchive \\")
    print("    -exportOptionsPlist Signing/ExportOptions.plist \\")
    print("    -exportPath build/export \\")
    print("    -allowProvisioningUpdates")
    print()
    print("This has NOT been executed by this script. Signing, archiving, and export against "
          "real Apple infrastructure remain BLOCKED BY APPLE INFRASTRUCTURE until a real Team ID "
          "and a signed-in Xcode session exist on a macOS machine.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
