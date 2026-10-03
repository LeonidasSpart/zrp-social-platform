#!/usr/bin/env python3
"""Fail if any crate actually reachable for this build is incompatible
with the platform-tools cargo.

cargo build-sbf (invoked by `anchor build`) uses Solana's own bundled
"platform-tools" cross-compiler - a fixed, old Cargo that is older than
the host's cargo used here to resolve dependencies. Two independent gates
can make a resolved crate incompatible with it, and both are checked:

1. `edition = "2024"` - a Cargo feature that platform-tools' cargo predates
   and cannot even parse the manifest of.
2. `rust-version` (MSRV) newer than platform-tools' own rustc version -
   checked by Cargo at build time regardless of edition, and caught a real
   case (indexmap/proc-macro-crate/unicode-segmentation) that an
   edition-only check missed.

Run against the output of `cargo metadata --format-version 1` (executed
with the host's modern cargo, full resolve graph, not --no-deps).

Reachability filtering: `cargo metadata` resolves the graph for every
possible target, including crates gated behind
`cfg(any(target_arch = "wasm32", target_arch = "wasm64"))` (e.g. the
wasm-bindgen family pulled in optionally by getrandom's "js" backend).
Solana's SBF/BPF program target is never wasm32/wasm64, so those edges
are excluded from the reachability walk below - a package is only
flagged if there's a path to it that isn't wasm-only. This mirrors the
real `anchor build` failure observed in CI, which named exactly
indexmap/proc-macro-crate/unicode-segmentation and never the
wasm-bindgen family. Other platform cfgs (unix/windows/etc.) are NOT
excluded, since Solana's SBF target's own cfg story isn't verified here -
better to over-report a reachable-but-actually-inert crate (cheap: pin it
anyway) than silently miss a real one.

PLATFORM_TOOLS_RUSTC below must track the rustc bundled with whatever
platform-tools version ships with SOLANA_VERSION in
.github/workflows/solana-program-ci.yml - update it if that version
changes (the real `anchor build` error names the exact version on
mismatch, e.g. "rustc 1.79.0-dev is not supported").
"""
import json
import sys

PLATFORM_TOOLS_RUSTC = (1, 79, 0)
WASM_ONLY_MARKERS = ('target_arch = "wasm32"', 'target_arch = "wasm64"')


def parse_version(v):
    if not v:
        return (0, 0, 0)
    parts = v.replace("-dev", "").split(".")
    try:
        return tuple(int(p) for p in (parts + ["0", "0"])[:3])
    except ValueError:
        return (999, 999, 999)


def is_wasm_only(target_cfg):
    if not target_cfg:
        return False
    return any(marker in target_cfg for marker in WASM_ONLY_MARKERS)


data = json.load(sys.stdin)
resolve = data["resolve"]
nodes_by_id = {n["id"]: n for n in resolve["nodes"]}
packages_by_id = {p["id"]: p for p in data["packages"]}

roots = [resolve["root"]] if resolve.get("root") else list(data["workspace_default_members"])
reachable = set()
stack = list(roots)
while stack:
    node_id = stack.pop()
    if node_id in reachable:
        continue
    reachable.add(node_id)
    node = nodes_by_id.get(node_id)
    if not node:
        continue
    for dep in node["deps"]:
        if dep["dep_kinds"] and all(is_wasm_only(dk["target"]) for dk in dep["dep_kinds"]):
            continue
        stack.append(dep["pkg"])

bad_edition = []
bad_msrv = []
for node_id in reachable:
    p = packages_by_id.get(node_id)
    if not p:
        continue
    if p.get("edition") == "2024":
        bad_edition.append(p)
    rv = p.get("rust_version")
    if rv and parse_version(rv) > PLATFORM_TOOLS_RUSTC:
        bad_msrv.append(p)

if bad_edition or bad_msrv:
    print("The following crates, reachable for this build, are incompatible")
    print("with the platform-tools cargo bundled with cargo build-sbf. Pin")
    print("each one (or whatever pulls it in) as a direct dependency of")
    print("programs/zrp-launchpad, following the pattern already used in")
    print("that crate's Cargo.toml for zeroize/toml_edit/blake3/indexmap/")
    print("zeroize_derive/toml_datetime/toml_writer/toml_parser/")
    print("unicode-segmentation/proc-macro-crate:")
    for p in bad_edition:
        print(f"  - {p['name']} {p['version']}: declares edition2024")
    for p in bad_msrv:
        print(
            f"  - {p['name']} {p['version']}: requires rustc "
            f"{p['rust_version']}, platform-tools has "
            f"{'.'.join(str(n) for n in PLATFORM_TOOLS_RUSTC)}"
        )
    sys.exit(1)

print("OK: no reachable crate requires edition2024 or a newer rustc than platform-tools provides.")
