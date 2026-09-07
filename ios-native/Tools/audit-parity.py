#!/usr/bin/env python3
"""
Check PARITY.md against reality.

A parity matrix is only worth anything if it cannot quietly become
fiction, and prose review is exactly the wrong tool for that - the author
reads what they meant. This checks the two claims that can actually be
falsified:

  1. Every backend route the matrix names really exists in src/app/api.
     A typo'd or renamed route would otherwise sit in the document
     looking authoritative.

  2. Every row marked IMPLEMENTED on iOS is backed by iOS code that
     really calls that route. This is the one that catches over-claiming,
     which is the failure mode that matters: a matrix that says a feature
     is done when nothing calls the endpoint.

Rows that are MISSING, PARTIAL, BLOCKED, n/a or out of scope are not
required to have call sites - that is what those words mean.

Run from ios-native/:  python3 Tools/audit-parity.py
"""

from __future__ import annotations

import os
import re
import sys

IOS_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO_ROOT = os.path.abspath(os.path.join(IOS_ROOT, ".."))
PARITY = os.path.join(IOS_ROOT, "PARITY.md")
API_ROOT = os.path.join(REPO_ROOT, "src", "app", "api")
SWIFT_ROOT = os.path.join(IOS_ROOT, "ZRPSocial")

# Routes named in prose that are deliberately not app routes, or are
# wildcards standing for a family.
IGNORED_ROUTES = {
    "/api/admin/**",
    "/api/uploadthing",
}

IMPLEMENTED = "IMPLEMENTED"
EXEMPT_STATUSES = ("MISSING", "PARTIAL", "BLOCKED", "STAFF/ADMIN", "OUT OF SCOPE", "n/a")


def swift_sources() -> str:
    chunks = []
    for root, _, files in os.walk(SWIFT_ROOT):
        for name in files:
            if name.endswith(".swift"):
                with open(os.path.join(root, name), encoding="utf-8") as handle:
                    chunks.append(handle.read())
    return "\n".join(chunks)


def route_exists(path: str) -> bool:
    """`/api/music/albums/{id}` -> src/app/api/music/albums/[id]/route.ts

    Also resolves Next.js **catch-all** segments. `/api/auth/session` has
    no directory of its own: NextAuth serves it from
    `src/app/api/auth/[...nextauth]/route.ts`, which handles every path
    beneath `auth/`. Treating that as missing would report a route the
    app genuinely calls as fiction.
    """
    relative = path[len("/api/"):]
    segments = [
        f"[{segment[1:-1]}]" if segment.startswith("{") and segment.endswith("}") else segment
        for segment in relative.split("/")
        if segment
    ]
    if os.path.isfile(os.path.join(API_ROOT, *segments, "route.ts")):
        return True

    # Walk up looking for a catch-all that would claim this path.
    for depth in range(len(segments), 0, -1):
        parent = os.path.join(API_ROOT, *segments[: depth - 1])
        if not os.path.isdir(parent):
            continue
        for entry in os.listdir(parent):
            if entry.startswith("[...") and entry.endswith("]"):
                if os.path.isfile(os.path.join(parent, entry, "route.ts")):
                    return True
    return False


def ios_calls(path: str, sources: str) -> bool:
    """Does any Swift file address this route?

    Compares on the path *after* /api/, with `{param}` matched loosely
    since Swift writes those as string interpolations.
    """
    relative = path[len("/api/"):].strip("/")
    pattern = "".join(
        r"[^\"]*" if segment.startswith("{") else re.escape(segment) + "/"
        for segment in relative.split("/")
    ).rstrip("/")
    # `music/tracks/{id}` -> music/tracks/[^"]*   (matches "music/tracks/\(id)")
    return re.search(pattern, sources) is not None


def main() -> int:
    with open(PARITY, encoding="utf-8") as handle:
        lines = handle.read().split("\n")

    sources = swift_sources()
    missing_routes: list[str] = []
    unbacked: list[str] = []
    checked_routes: set[str] = set()
    implemented_rows = 0

    for line in lines:
        if not line.startswith("|") or line.startswith("| ---"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) < 6:
            continue

        feature, routes_cell, _web, _android, _ios, status = cells[:6]
        if feature in ("Feature",):
            continue

        routes = re.findall(r"`(?:[A-Z]+ )?(/api/[A-Za-z0-9_{}/\[\]-]+)`", routes_cell)
        for route in routes:
            route = route.rstrip("/")
            if route in IGNORED_ROUTES:
                continue
            checked_routes.add(route)
            if not route_exists(route):
                missing_routes.append(f"{route}   (row: {feature})")

        if status.startswith(IMPLEMENTED):
            implemented_rows += 1
            for route in routes:
                route = route.rstrip("/")
                if route in IGNORED_ROUTES:
                    continue
                if not ios_calls(route, sources):
                    unbacked.append(f"{route}   (row: {feature})")

    print("PARITY audit\n")
    print(f"  rows marked {IMPLEMENTED}: {implemented_rows}")
    print(f"  distinct backend routes referenced: {len(checked_routes)}")

    problems = 0

    if missing_routes:
        problems += len(missing_routes)
        print(f"\n  {len(missing_routes)} route(s) named in PARITY.md that do NOT exist:")
        for entry in sorted(set(missing_routes)):
            print(f"    - {entry}")
    else:
        print("  every referenced route exists in src/app/api")

    if unbacked:
        problems += len(unbacked)
        print(f"\n  {len(unbacked)} route(s) marked IMPLEMENTED with no iOS call site:")
        for entry in sorted(set(unbacked)):
            print(f"    - {entry}")
    else:
        print("  every IMPLEMENTED row is backed by iOS code that calls its route")

    if problems:
        print(f"\naudit-parity: {problems} problem(s)")
        return 1

    print("\naudit-parity: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
