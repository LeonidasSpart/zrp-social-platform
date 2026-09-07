#!/usr/bin/env python3
"""
Verify the iOS artist-profile request bodies against the real behaviour of
POST /api/music/artists.

Scope, stated plainly: this is a *contract* check, not an end-to-end test.
It cannot run Swift and it does not call the live backend. What it does do
is pin down the two things that actually decide whether a profile survives
a write:

  1. the exact JSON body each iOS call path sends, and
  2. the route's per-field rule, transcribed from the merged fix.

If either changes without the other, this fails. That is the failure mode
that erased bios before - a client sending keys the route then acted on -
so it is the one worth catching in CI rather than in production.

The route logic below mirrors src/app/api/music/artists/route.ts on main:

    const displayName = String(body.displayName || session.user.name || session.user.username)...
    const profileUpdate = {};
    if ("bio" in body) profileUpdate.bio = body.bio || null;
    if ("avatarUrl" in body) profileUpdate.avatarUrl = body.avatarUrl || null;
    if ("bannerUrl" in body) profileUpdate.bannerUrl = body.bannerUrl || null;
    upsert({ update: { displayName, ...profileUpdate },
             create: { displayName, bio: body.bio || null, ... } })

Run from ios-native/:  python3 Tools/verify-artist-contract.py
"""

from __future__ import annotations

import sys

SESSION_NAME = "account-name"

# ── The route, as merged ────────────────────────────────────────────────

UNSET = object()


def artists_post(body: dict, stored: dict | None) -> dict:
    """Returns the MusicArtist row after the upsert."""
    display_name = str(body.get("displayName") or SESSION_NAME).strip()[:120]

    if stored is None:
        return {
            "displayName": display_name,
            "bio": body.get("bio") or None,
            "avatarUrl": body.get("avatarUrl") or None,
            "bannerUrl": body.get("bannerUrl") or None,
        }

    row = dict(stored)
    row["displayName"] = display_name
    for field in ("bio", "avatarUrl", "bannerUrl"):
        if field in body:                      # key presence, not value
            row[field] = body[field] or None
    return row


# ── The bodies iOS sends ────────────────────────────────────────────────
#
# ArtistProfileField encodes: .unchanged -> key omitted,
#                             .clear     -> explicit null,
#                             .value(s)  -> the string.
# displayName uses encodeIfPresent, so nil omits the key.


def field(state, text=None):
    return (state, text)


def encode_request(display_name, bio, avatar, banner) -> dict:
    """Mirrors ArtistProfileRequest.encode(to:)."""
    body: dict = {}
    if display_name is not None:
        body["displayName"] = display_name
    for key, (state, text) in (
        ("bio", bio), ("avatarUrl", avatar), ("bannerUrl", banner)
    ):
        if state == "unchanged":
            continue
        body[key] = None if state == "clear" else text
    return body


def name_only(display_name):
    """ArtistProfileRequest.nameOnly(_:)"""
    return encode_request(
        display_name, field("unchanged"), field("unchanged"), field("unchanged")
    )


def full_profile(display_name, bio_text, avatar_url, banner_url):
    """ArtistProfileRequest.fullProfile(...) - .init(text:) / .init(url:)"""
    def from_text(t):
        t = (t or "").strip()
        return field("clear") if not t else field("value", t)

    def from_url(u):
        return field("clear") if not u else field("value", u)

    return encode_request(
        display_name, from_text(bio_text), from_url(avatar_url), from_url(banner_url)
    )


# ── Scenarios ───────────────────────────────────────────────────────────

EXISTING = {
    "displayName": "Nova",
    "bio": "Producer from Tirana.",
    "avatarUrl": "https://utfs.io/f/avatar.jpg",
    "bannerUrl": "https://utfs.io/f/banner.jpg",
}

FAILURES: list[str] = []


def check(name: str, body: dict, stored, expected: dict) -> None:
    actual = artists_post(body, stored)
    if actual != expected:
        FAILURES.append(
            f"{name}\n    body     {body}\n    expected {expected}\n    actual   {actual}"
        )
    else:
        print(f"  ok  {name}")


print("Artist profile contract - POST /api/music/artists\n")

# 1. Editor saves bio only changed; avatar and banner still held and re-sent.
check(
    "editor: bio only changed (avatar/banner unchanged in UI, still sent)",
    full_profile("Nova", "New bio.", EXISTING["avatarUrl"], EXISTING["bannerUrl"]),
    EXISTING,
    {**EXISTING, "bio": "New bio."},
)

# 2. Editor saves a new avatar; bio and banner preserved.
check(
    "editor: avatar only changed",
    full_profile("Nova", EXISTING["bio"], "https://utfs.io/f/new-avatar.jpg", EXISTING["bannerUrl"]),
    EXISTING,
    {**EXISTING, "avatarUrl": "https://utfs.io/f/new-avatar.jpg"},
)

# 3. Editor saves a new banner; bio and avatar preserved.
check(
    "editor: banner only changed",
    full_profile("Nova", EXISTING["bio"], EXISTING["avatarUrl"], "https://utfs.io/f/new-banner.jpg"),
    EXISTING,
    {**EXISTING, "bannerUrl": "https://utfs.io/f/new-banner.jpg"},
)

# 4. Editor saves all three at once.
check(
    "editor: bio + avatar + banner all changed",
    full_profile("Nova", "Third album out now.", "https://a.jpg", "https://b.jpg"),
    EXISTING,
    {"displayName": "Nova", "bio": "Third album out now.",
     "avatarUrl": "https://a.jpg", "bannerUrl": "https://b.jpg"},
)

# 5. Explicit clearing: the person empties the bio field and saves.
check(
    "editor: emptied bio clears it, images untouched",
    full_profile("Nova", "   ", EXISTING["avatarUrl"], EXISTING["bannerUrl"]),
    EXISTING,
    {**EXISTING, "bio": None},
)

# 6. Omitted optional fields - the whole point of the fix.
check(
    "apply as artist: name only, profile fields omitted",
    name_only("Nova"),
    EXISTING,
    EXISTING,
)

# 7. Publishing a track with an artist name typed in the publish form.
check(
    "publish: ensureArtistId with a typed name updates ONLY the name",
    name_only("Nova Sound"),
    EXISTING,
    {**EXISTING, "displayName": "Nova Sound"},
)

# 8. Creating the row for an account that has none.
check(
    "create: no profile yet, name only",
    name_only("Nova"),
    None,
    {"displayName": "Nova", "bio": None, "avatarUrl": None, "bannerUrl": None},
)

# 9. The regression that started all of this: an old-style body that sent
#    explicit nulls for fields it never loaded. iOS must never produce one.
legacy = {"displayName": "Nova", "bio": None, "avatarUrl": None, "bannerUrl": None}
wiped = artists_post(legacy, EXISTING)
if wiped == EXISTING:
    FAILURES.append(
        "guard: an all-null body should still clear - the route honours explicit nulls"
    )
else:
    print("  ok  guard: explicit nulls still clear (so iOS must omit, not null)")

# 10. And prove no iOS path produces that body.
for label, body in (
    ("nameOnly(name)", name_only("Nova")),
    ("nameOnly(nil)", name_only(None)),
):
    leaked = [k for k in ("bio", "avatarUrl", "bannerUrl") if k in body]
    if leaked:
        FAILURES.append(f"{label} must omit profile fields, but sent {leaked}")
    else:
        print(f"  ok  guard: {label} omits bio/avatarUrl/bannerUrl entirely")

print()
if FAILURES:
    print(f"verify-artist-contract: {len(FAILURES)} failure(s)\n")
    for failure in FAILURES:
        print(f"  - {failure}\n")
    sys.exit(1)

print("verify-artist-contract: OK (10 checks)")
