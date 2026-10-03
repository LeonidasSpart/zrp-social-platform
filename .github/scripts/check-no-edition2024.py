#!/usr/bin/env python3
"""Fail if any resolved crate declares edition2024.

cargo build-sbf (invoked by `anchor build`) uses Solana's own bundled
"platform-tools" cross-compiler - a fixed, old Cargo that predates the
Cargo `edition2024` feature and cannot even parse the manifest of a crate
declaring it. Run against the output of `cargo metadata --format-version 1`
(executed with the host's modern cargo, which does support edition2024)
so a future dependency bump that reintroduces an edition2024 crate fails
here with a clear message instead of as a cryptic cargo build-sbf panic.
"""
import json
import sys

data = json.load(sys.stdin)
bad = [p for p in data["packages"] if p.get("edition") == "2024"]

if bad:
    print("The following resolved crates declare edition2024, which the")
    print("platform-tools cargo bundled with cargo build-sbf cannot parse.")
    print("Pin each one (or whatever pulls it in) as a direct dependency")
    print("of programs/zrp-launchpad, following the pattern already used")
    print("for zeroize/toml_edit/blake3/indexmap/zeroize_derive/")
    print("toml_datetime/toml_writer/toml_parser in that crate's Cargo.toml:")
    for p in bad:
        print(f"  - {p['name']} {p['version']}")
    sys.exit(1)

print("OK: no resolved crate requires edition2024.")
