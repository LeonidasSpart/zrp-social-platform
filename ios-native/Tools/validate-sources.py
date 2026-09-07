#!/usr/bin/env python3
"""
Static checks that run without Xcode.

Xcode is the only thing that can truly compile this app, so CI builds it
on macOS. These checks exist because they catch the specific classes of
mistake that are cheap to make and expensive to discover on a macOS
runner ten minutes later:

  1. A localization key used in Swift that does not exist in L10nKey,
     which would be a build error.
  2. A user-facing string literal hardcoded in a view instead of going
     through L10n.
  3. Unbalanced braces / brackets in a Swift file.
  4. Malformed plists or asset-catalog JSON.
  5. Any accidental reference to the Android module from iOS sources.

Run from ios-native/:  python3 Tools/validate-sources.py
"""

from __future__ import annotations

import json
import os
import plistlib
import re
import sys

IOS_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SOURCE_ROOT = os.path.join(IOS_ROOT, "ZRPSocial")
GENERATED_KEYS = os.path.join(SOURCE_ROOT, "Core", "Localization", "L10nKeys.swift")

failures: list[str] = []


def fail(message: str) -> None:
    failures.append(message)


def swift_files() -> list[str]:
    found = []
    for base, _dirs, files in os.walk(SOURCE_ROOT):
        for name in files:
            if name.endswith(".swift"):
                found.append(os.path.join(base, name))
    return sorted(found)


def check_localization_keys(paths: list[str]) -> None:
    with open(GENERATED_KEYS, encoding="utf-8") as handle:
        generated = handle.read()
    known = set(re.findall(r"^\s*case (\w+) = \"", generated, re.M))
    if not known:
        fail("L10nKeys.swift declares no cases - did the generator run?")
        return

    # `.someKey` appearing as an argument to Text(...) or L10n.string(...),
    # plus explicit `L10nKey.someKey` references.
    used: set[tuple[str, str]] = set()
    for path in paths:
        if path == GENERATED_KEYS:
            continue
        with open(path, encoding="utf-8") as handle:
            source = handle.read()
        for match in re.finditer(r"L10nKey\.(\w+)", source):
            # Static helpers on L10nKey, not cases.
            if match.group(1) in {"supportedLanguageCodes", "rightToLeftLanguageCodes", "allCases"}:
                continue
            used.add((match.group(1), path))
        for match in re.finditer(r"(?:Text|L10n\.string)\(\s*\.(\w+)", source):
            used.add((match.group(1), path))
        for match in re.finditer(r"label:\s*\.(\w+)\)", source):
            used.add((match.group(1), path))

    for key, path in sorted(used):
        if key not in known:
            fail(
                f"{os.path.relpath(path, IOS_ROOT)}: uses L10n key '.{key}' "
                "which is not in L10nKeys.swift (add it to "
                "Tools/ios-string-keys.txt or ios-extra-strings.json and re-run "
                "the generator)"
            )


# Literals that are legitimately not user-facing copy: SF Symbol names,
# asset names, format fragments, API field values.
ALLOWED_LITERAL = re.compile(
    r"^(?:"
    r"[a-z0-9]+(?:\.[a-z0-9]+)+"          # sf symbols / reverse-dns
    r"|[A-Za-z]+[A-Za-z0-9_]*"            # single identifiers e.g. "ZrpLogo"
    r"|https?://\S*"
    r"|[\s%@{}()\[\]/:,.\-_=#&?+*!|<>0-9]*"
    r")$"
)


def check_hardcoded_strings(paths: list[str]) -> None:
    for path in paths:
        if os.sep + "Core" + os.sep in path or os.sep + "Models" + os.sep in path:
            continue
        with open(path, encoding="utf-8") as handle:
            lines = handle.readlines()
        for number, line in enumerate(lines, start=1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("///"):
                continue
            # Only Text(verbatim:) with a literal is a real risk - every
            # other literal in a view is a symbol or an asset name.
            for literal in re.findall(r'Text\(verbatim:\s*"([^"]*)"\)', line):
                # Strip Swift string interpolations before judging the
                # literal. `"#\(tag)"` is punctuation plus a value, not
                # translatable copy - a hashtag renders identically in
                # every language. `"Hello \(name)"` still fails, because
                # what remains is a real word.
                bare = re.sub(r"\\\([^)]*\)", "", literal)
                if bare and not ALLOWED_LITERAL.match(bare):
                    fail(
                        f"{os.path.relpath(path, IOS_ROOT)}:{number}: hardcoded "
                        f'user-facing string "{literal}" - route it through L10n'
                    )


def strip_swift_noise(source: str) -> str:
    """Blank out comments and string literals, preserving everything else.

    A regex pass cannot do this correctly in either order: stripping
    comments first mangles the "https://..." inside a string literal, and
    stripping strings first mangles a quote inside a comment. A single
    left-to-right scan is the only way to get it right, so brace counting
    is not thrown off by punctuation that was never code.
    """
    out: list[str] = []
    index = 0
    length = len(source)

    while index < length:
        char = source[index]
        pair = source[index:index + 2]
        triple = source[index:index + 3]

        if triple == '"""':
            end = source.find('"""', index + 3)
            index = length if end == -1 else end + 3
            continue

        if char == '"':
            index += 1
            while index < length:
                if source[index] == "\\":
                    index += 2
                    continue
                if source[index] == '"':
                    index += 1
                    break
                if source[index] == "\n":
                    break
                index += 1
            continue

        if pair == "//":
            end = source.find("\n", index)
            index = length if end == -1 else end
            continue

        if pair == "/*":
            end = source.find("*/", index + 2)
            index = length if end == -1 else end + 2
            continue

        out.append(char)
        index += 1

    return "".join(out)


def check_balanced(paths: list[str]) -> None:
    pairs = {"}": "{", ")": "(", "]": "["}
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            source = strip_swift_noise(handle.read())

        stack: list[str] = []
        broken = False
        for char in source:
            if char in "{([":
                stack.append(char)
            elif char in pairs:
                if not stack or stack[-1] != pairs[char]:
                    fail(f"{os.path.relpath(path, IOS_ROOT)}: unbalanced '{char}'")
                    broken = True
                    break
                stack.pop()
        if not broken and stack:
            fail(
                f"{os.path.relpath(path, IOS_ROOT)}: "
                f"{len(stack)} unclosed '{stack[-1]}'"
            )


def check_plists() -> None:
    for relative in (
        os.path.join("Supporting", "Info.plist"),
        os.path.join("Supporting", "ZRPSocial.entitlements"),
        os.path.join("ZRPSocial", "PrivacyInfo.xcprivacy"),
    ):
        path = os.path.join(IOS_ROOT, relative)
        if not os.path.exists(path):
            fail(f"missing {relative}")
            continue
        try:
            with open(path, "rb") as handle:
                plistlib.load(handle)
        except Exception as exc:  # noqa: BLE001 - report whatever plistlib says
            fail(f"{relative}: invalid plist ({exc})")


def check_asset_catalog() -> None:
    catalog = os.path.join(SOURCE_ROOT, "Assets.xcassets")
    if not os.path.isdir(catalog):
        fail("Assets.xcassets is missing")
        return
    for base, _dirs, files in os.walk(catalog):
        for name in files:
            if name != "Contents.json":
                continue
            path = os.path.join(base, name)
            try:
                with open(path, encoding="utf-8") as handle:
                    json.load(handle)
            except json.JSONDecodeError as exc:
                fail(f"{os.path.relpath(path, IOS_ROOT)}: invalid JSON ({exc})")


# Required-reason APIs, mapped to the code that would be calling them.
# Apple rejects an upload whose PrivacyInfo.xcprivacy omits a category the
# binary actually uses (ITMS-91053).
REQUIRED_REASON_APIS: dict[str, tuple[str, ...]] = {
    "NSPrivacyAccessedAPICategoryUserDefaults": ("UserDefaults",),
    "NSPrivacyAccessedAPICategoryFileTimestamp": (
        ".modificationDate",
        ".creationDate",
        "contentModificationDateKey",
        "creationDateKey",
    ),
    "NSPrivacyAccessedAPICategoryDiskSpace": (
        "volumeAvailableCapacity",
        "systemFreeSize",
        "systemSize",
    ),
    "NSPrivacyAccessedAPICategorySystemBootTime": (
        "systemUptime",
        "mach_absolute_time",
    ),
    "NSPrivacyAccessedAPICategoryActiveKeyboard": ("activeInputModes",),
}


def check_privacy_manifest(paths: list[str]) -> None:
    """The privacy manifest must match what the code actually calls.

    This drifted once already: the manifest shipped with an empty API
    list and a comment predicting that UserDefaults and file-timestamp
    APIs would need declaring "the moment they are first used". Both were
    later used, and nothing caught it. This does.

    Both directions fail. An omission is an App Store rejection; a stale
    declaration is a false statement about the app's behaviour.
    """
    manifest_path = os.path.join(SOURCE_ROOT, "PrivacyInfo.xcprivacy")
    if not os.path.isfile(manifest_path):
        fail("ZRPSocial/PrivacyInfo.xcprivacy is missing")
        return

    try:
        with open(manifest_path, "rb") as handle:
            manifest = plistlib.load(handle)
    except Exception as error:  # noqa: BLE001 - reported, not raised
        fail(f"PrivacyInfo.xcprivacy is not a valid plist: {error}")
        return

    declared = {
        entry.get("NSPrivacyAccessedAPIType")
        for entry in manifest.get("NSPrivacyAccessedAPITypes", [])
    }

    # Comments are stripped before matching. `Keychain.swift` explains
    # why the token is NOT in UserDefaults, and a check that reads that
    # sentence as usage would demand declarations for APIs the app
    # deliberately avoids - and, worse, keep demanding them after the
    # real call site was deleted.
    sources = []
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            sources.append((path, strip_swift_noise(handle.read())))

    for category, needles in REQUIRED_REASON_APIS.items():
        users = [
            os.path.relpath(path, IOS_ROOT)
            for path, source in sources
            if any(needle in source for needle in needles)
        ]
        if users and category not in declared:
            fail(
                f"PrivacyInfo.xcprivacy does not declare {category}, but it is "
                f"used in: {', '.join(sorted(users)[:3])}"
            )
        if not users and category in declared:
            fail(
                f"PrivacyInfo.xcprivacy declares {category}, but no source uses "
                "it - a manifest must describe what the app really does"
            )


def check_dynamic_type(paths: list[str]) -> None:
    """Text must never use a hardcoded point size.

    SwiftUI's `.font(.system(size: N))` is a FIXED size - unlike a text
    style such as `.caption2`, it stays N points at every Dynamic Type
    setting, including the accessibility sizes. Two badges shipped that
    way and were unreadable for anyone using large text.

    Only `Text` is checked. A literal size on an `Image` glyph is
    normally correct: those are sized to fit a fixed container, the
    button around them carries the VoiceOver label, and scaling them
    would break the layout rather than help anyone.
    """
    pattern = re.compile(r"\.font\(\s*\.system\(size:\s*\d")
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            lines = handle.read().split("\n")
        for index, line in enumerate(lines):
            if not pattern.search(line):
                continue
            # Walk back to whatever this modifier is attached to.
            owner = ""
            for previous in range(index, max(-1, index - 6), -1):
                stripped = lines[previous].strip()
                if stripped.startswith("."):
                    continue
                owner = stripped
                break
            if "Text(" in owner:
                fail(
                    f"{os.path.relpath(path, IOS_ROOT)}:{index + 1}: Text uses a "
                    "hardcoded .system(size:) - it will not scale with Dynamic "
                    "Type. Use a text style such as .caption2."
                )


def check_no_android_references(paths: list[str]) -> None:
    """The iOS module must never reach into the Android project."""
    for path in paths + [os.path.join(IOS_ROOT, "Tools", "generate-localizations.py")]:
        with open(path, encoding="utf-8") as handle:
            source = handle.read()
        if "android-native" in source or "android/" in source:
            fail(
                f"{os.path.relpath(path, IOS_ROOT)}: references the Android "
                "module - iOS must stay independent of it"
            )


def check_localizations_complete() -> None:
    resources = os.path.join(SOURCE_ROOT, "Resources")
    expected = {"en", "fr", "de", "it", "sq", "es", "ru", "ar", "zh", "tr", "id"}
    if not os.path.isdir(resources):
        fail("ZRPSocial/Resources is missing - run the localization generator")
        return
    present = {
        name[: -len(".lproj")]
        for name in os.listdir(resources)
        if name.endswith(".lproj")
    }
    missing = expected - present
    if missing:
        fail(
            "missing .lproj bundles for ZRP's supported languages: "
            + ", ".join(sorted(missing))
        )


def main() -> int:
    paths = swift_files()
    if not paths:
        fail("no Swift sources found")
        return 1

    check_localization_keys(paths)
    check_hardcoded_strings(paths)
    check_balanced(paths)
    check_plists()
    check_asset_catalog()
    check_dynamic_type(paths)
    check_privacy_manifest(paths)
    check_no_android_references(paths)
    check_localizations_complete()

    if failures:
        print(f"validate-sources: {len(failures)} problem(s)\n")
        for problem in failures:
            print(f"  - {problem}")
        return 1

    print(f"validate-sources: OK ({len(paths)} Swift files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
