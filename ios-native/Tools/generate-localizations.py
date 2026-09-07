#!/usr/bin/env python3
"""
Generate the iOS app's Localizable.strings files and its L10n key enum
from the web app's own translation dictionary.

ZRP already ships 11 officially supported languages, with real human
translations, in src/lib/translations.ts. Retyping any of that into iOS
resources by hand would guarantee drift and risk quietly dropping a
language. Instead this reads that exact file and emits, for every one of
those 11 languages, a .lproj/Localizable.strings containing only the keys
iOS actually uses (Tools/ios-string-keys.txt).

It also emits Core/Localization/L10nKeys.swift, so every key is reachable
as a compiler-checked static constant rather than a stringly-typed
lookup. A key renamed on web fails this generator; a key removed from the
list fails the Swift build. Neither can degrade silently at runtime.

Usage (from ios-native/):
    python3 Tools/generate-localizations.py

Re-run it after changing Tools/ios-string-keys.txt, after adding an
iOS-only string to Tools/ios-extra-strings.json, or after the web app's
translations change. CI runs it with --check to fail if the committed
output is stale.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TRANSLATIONS_TS = os.path.join(REPO_ROOT, "src", "lib", "translations.ts")
IOS_ROOT = os.path.join(REPO_ROOT, "ios-native")
KEYS_FILE = os.path.join(IOS_ROOT, "Tools", "ios-string-keys.txt")
EXTRA_FILE = os.path.join(IOS_ROOT, "Tools", "ios-extra-strings.json")
RESOURCES_DIR = os.path.join(IOS_ROOT, "ZRPSocial", "Resources")
SWIFT_OUT = os.path.join(
    IOS_ROOT, "ZRPSocial", "Core", "Localization", "L10nKeys.swift"
)

DEV_LANGUAGE = "en"

# Matches one `"key": "value",` entry. The value pattern allows any
# escaped character, so an apostrophe, an embedded quote, or a unicode
# escape inside a translation is captured whole rather than truncating
# the match at the first backslash.
PAIR_RE = re.compile(r'^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"', re.M)


def parse_translations() -> tuple[list[str], dict[str, dict[str, str]]]:
    """Return (ordered language codes, {lang: {key: value}})."""
    with open(TRANSLATIONS_TS, encoding="utf-8") as handle:
        source = handle.read()

    try:
        body = source[source.index("export const translations"):]
    except ValueError:
        sys.exit(
            "error: could not find `export const translations` in "
            f"{TRANSLATIONS_TS} - has the web app's translation module "
            "been restructured?"
        )

    # Each language is a top-level `  xx: {` ... `  },` block inside the
    # translations object.
    blocks = re.findall(r"^  ([a-z]{2}): \{$(.*?)^  \},?$", body, re.M | re.S)
    if not blocks:
        sys.exit("error: no language blocks parsed from translations.ts")

    languages: list[str] = []
    table: dict[str, dict[str, str]] = {}
    for code, block in blocks:
        entries: dict[str, str] = {}
        for key, raw_value in PAIR_RE.findall(block):
            # The captured value still carries TypeScript/JSON string
            # escapes. Round-tripping it through the JSON decoder is the
            # only correct way to resolve \n, \", \\ and \uXXXX - doing
            # it with str.replace() gets nested escapes wrong.
            try:
                entries[key] = json.loads(f'"{raw_value}"')
            except json.JSONDecodeError as exc:
                sys.exit(f"error: could not decode {code}.{key}: {exc}")
        languages.append(code)
        table[code] = entries
    return languages, table


def parse_language_metadata(source: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Read SUPPORTED_LANGUAGES and RTL_LANGUAGES from translations.ts.

    These are the web app's own declarations. Restating either on the
    iOS side would let the picker drift - offering a language with no
    strings, or failing to mirror the interface for a new RTL one.
    """
    block = re.search(
        r"export const SUPPORTED_LANGUAGES[^=]*=\s*\[(.*?)\];", source, re.S
    )
    if not block:
        sys.exit("error: SUPPORTED_LANGUAGES not found in translations.ts")
    labels = re.findall(
        r'\{\s*code:\s*"([^"]+)"\s*,\s*label:\s*"((?:[^"\\]|\\.)*)"\s*\}', block.group(1)
    )
    if not labels:
        sys.exit("error: could not parse any entries from SUPPORTED_LANGUAGES")

    rtl_block = re.search(r"export const RTL_LANGUAGES[^=]*=\s*\[(.*?)\];", source, re.S)
    if not rtl_block:
        sys.exit("error: RTL_LANGUAGES not found in translations.ts")
    rtl = re.findall(r'"([^"]+)"', rtl_block.group(1))

    decoded = [(code, json.loads(f'"{label}"')) for code, label in labels]
    return decoded, rtl


def load_wanted_keys() -> list[str]:
    keys: list[str] = []
    with open(KEYS_FILE, encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if stripped in keys:
                sys.exit(f"error: duplicate key in ios-string-keys.txt: {stripped}")
            keys.append(stripped)
    return keys


def load_extra_strings() -> dict[str, str]:
    with open(EXTRA_FILE, encoding="utf-8") as handle:
        return json.load(handle)["strings"]


def escape_strings_value(value: str) -> str:
    """Escape a value for a .strings file (a C-style quoted literal)."""
    return (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\t", "\\t")
    )


def swift_identifier(key: str) -> str:
    """`auth.errSomethingWrong` -> `authErrSomethingWrong`."""
    head, *tail = key.split(".")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


def render_strings_file(
    language: str, keys: list[str], values: dict[str, str], extras: dict[str, str]
) -> str:
    lines = [
        "/* ZRP Social - GENERATED FILE, DO NOT EDIT BY HAND.",
        "   Produced by ios-native/Tools/generate-localizations.py from the",
        "   web app's own dictionary (src/lib/translations.ts), which is the",
        f"   single source of truth for ZRP copy. Language: {language}. */",
        "",
    ]
    for key in keys:
        value = values.get(key)
        if value is None:
            # Not a fatal error for a non-development language: the web
            # dictionary itself may not have every key in every language,
            # and iOS falls back to the development language for a
            # missing key. Recorded so the gap is visible.
            lines.append(f"/* MISSING in {language}, falls back to {DEV_LANGUAGE}: {key} */")
            continue
        lines.append(f'"{key}" = "{escape_strings_value(value)}";')

    if language == DEV_LANGUAGE and extras:
        lines.append("")
        lines.append("/* iOS-only strings (see Tools/ios-extra-strings.json). Emitted")
        lines.append("   into the development language only - other languages fall back")
        lines.append("   here until these are translated. */")
        for key, value in extras.items():
            lines.append(f'"{key}" = "{escape_strings_value(value)}";')

    return "\n".join(lines) + "\n"


def render_swift(keys: list[str], extras: dict[str, str], en: dict[str, str]) -> str:
    lines = [
        "// ZRP Social - GENERATED FILE, DO NOT EDIT BY HAND.",
        "//",
        "// Produced by ios-native/Tools/generate-localizations.py. Every",
        "// constant below is a key present in the web app's own translation",
        "// dictionary (src/lib/translations.ts) or in",
        "// Tools/ios-extra-strings.json, so a user-facing string can never be",
        "// hardcoded in a SwiftUI view and can never drift from web copy.",
        "//",
        "// Look a value up with `L10n.string(.authSignIn)`, or",
        "// `L10n.string(.feedError, [\"message\": text])` when the copy carries",
        "// {placeholder} tokens.",
        "",
        "import Foundation",
        "",
        "/// A localization key known to exist in the shipped .strings files.",
        "enum L10nKey: String, CaseIterable {",
    ]
    for key in keys:
        comment = en.get(key, "")
        if comment:
            lines.append(f"    /// en: {json.dumps(comment, ensure_ascii=False)}")
        lines.append(f'    case {swift_identifier(key)} = "{key}"')
    for key, value in extras.items():
        lines.append(f"    /// en: {json.dumps(value, ensure_ascii=False)}")
        lines.append(f'    case {swift_identifier(key)} = "{key}"')
    lines.append("}")
    lines.append("")
    lines.append("extension L10nKey {")
    lines.append("    /// The languages ZRP officially supports, in the same order as")
    lines.append("    /// the web app's SUPPORTED_LANGUAGES.")
    lines.append("    static let supportedLanguageCodes: [String] = [")
    lines.append("        " + ", ".join(f'"{code}"' for code in SUPPORTED_ORDER))
    lines.append("    ]")
    lines.append("")
    lines.append("    /// ZRP's right-to-left languages, read from the web app's own")
    lines.append("    /// RTL_LANGUAGES rather than restated here.")
    lines.append("    static let rightToLeftLanguageCodes: Set<String> = [")
    lines.append("        " + ", ".join(f'"{code}"' for code in RTL_ORDER))
    lines.append("    ]")
    lines.append("}")
    lines.append("")
    lines.append("/// One selectable language.")
    lines.append("///")
    lines.append("/// Generated from `SUPPORTED_LANGUAGES` in src/lib/translations.ts, so")
    lines.append("/// the picker cannot list a language the app has no strings for, and")
    lines.append("/// the names are the web app's own - each written in its own")
    lines.append("/// language, which is how a person finds theirs in a list they")
    lines.append("/// cannot otherwise read.")
    lines.append("struct ZrpLanguage: Identifiable, Equatable {")
    lines.append("    let code: String")
    lines.append("    let nativeName: String")
    lines.append("")
    lines.append("    var id: String { code }")
    lines.append("    var isRightToLeft: Bool { L10nKey.rightToLeftLanguageCodes.contains(code) }")
    lines.append("")
    lines.append("    static let all: [ZrpLanguage] = [")
    for code, label in SUPPORTED_LABELS:
        lines.append(
            f'        ZrpLanguage(code: "{code}", nativeName: {json.dumps(label, ensure_ascii=False)}),'
        )
    lines.append("    ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


SUPPORTED_ORDER: list[str] = []
SUPPORTED_LABELS: list[tuple[str, str]] = []
RTL_ORDER: list[str] = []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the committed output differs from freshly generated output",
    )
    args = parser.parse_args()

    languages, table = parse_translations()
    SUPPORTED_ORDER[:] = languages

    with open(TRANSLATIONS_TS, encoding="utf-8") as handle:
        labels, rtl = parse_language_metadata(handle.read())
    SUPPORTED_LABELS[:] = labels
    RTL_ORDER[:] = rtl

    declared = {code for code, _ in labels}
    if declared != set(languages):
        sys.exit(
            "error: SUPPORTED_LANGUAGES and the translation blocks disagree: "
            f"{sorted(declared ^ set(languages))}"
        )

    if DEV_LANGUAGE not in table:
        sys.exit(f"error: development language '{DEV_LANGUAGE}' missing from translations.ts")

    keys = load_wanted_keys()
    extras = load_extra_strings()

    missing = [key for key in keys if key not in table[DEV_LANGUAGE]]
    if missing:
        sys.exit(
            "error: these keys are listed in ios-string-keys.txt but do not "
            "exist in translations.ts's `en` block:\n  "
            + "\n  ".join(missing)
        )

    overlap = sorted(set(extras) & set(table[DEV_LANGUAGE]))
    if overlap:
        sys.exit(
            "error: these iOS-only keys collide with real web keys - use the "
            "web key instead:\n  " + "\n  ".join(overlap)
        )

    outputs: dict[str, str] = {}
    for language in languages:
        path = os.path.join(RESOURCES_DIR, f"{language}.lproj", "Localizable.strings")
        outputs[path] = render_strings_file(language, keys, table[language], extras)
    outputs[SWIFT_OUT] = render_swift(keys, extras, table[DEV_LANGUAGE])

    stale: list[str] = []
    for path, content in outputs.items():
        existing = None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as handle:
                existing = handle.read()
        if existing == content:
            continue
        if args.check:
            stale.append(os.path.relpath(path, REPO_ROOT))
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)

    if args.check:
        if stale:
            print("error: generated localization output is stale. Re-run:")
            print("    python3 ios-native/Tools/generate-localizations.py")
            for path in stale:
                print(f"  stale: {path}")
            return 1
        print(f"localizations up to date ({len(languages)} languages, {len(keys)} shared keys)")
        return 0

    print(
        f"wrote {len(languages)} .strings files "
        f"({len(keys)} shared keys + {len(extras)} iOS-only) and L10nKeys.swift"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
