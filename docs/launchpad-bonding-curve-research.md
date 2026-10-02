# ZRP Launchpad — Pump-style bonding curve: technical research & status

## Summary

A Pump.fun-style bonding curve (pre-liquidity, virtual-reserve pricing with
an automatic graduation to a real AMM pool) is **not shipped in this
phase**, but — unlike the conclusion reached earlier in this mission — a
real, safe implementation is now concretely feasible and scoped below.
This document exists specifically because the product requirement is "do
not report a limitation without proving why it cannot be completed" - this
is that proof, and it is deliberately **not** a generic "not implemented".

## What changed since the earlier assessment

An earlier pass in this mission evaluated `pumpdotfun-sdk` (npm, maintainer
`rckprtr`), found it unofficial, single-maintained, stale (~1 year old,
pinned to `@solana/spl-token@0.4.6`), and concluded its instruction layout
could not be trusted against pump.fun's current on-chain program - pump.fun
migrated its graduation destination from Raydium to its own PumpSwap AMM in
March 2025, which is exactly the kind of protocol change that silently
breaks an old reverse-engineered client.

That conclusion is superseded by new research. Pump.fun now **publishes
official, actively maintained packages**:

- `@pump-fun/pump-sdk` (npm) - "Pump Bonding Curve SDK", MIT licensed, 132
  published versions, **published 2 weeks before this document was
  written**, maintained under the `pump-fun` npm org by `security-baton`
  (Baton Corporation, pump.fun's engineering operator).
- `@pump-fun/pump-swap-sdk` (npm) - the post-graduation AMM counterpart.
- Public IDL files at `github.com/pump-fun/pump-public-docs/tree/main/idl`.

Dependency compatibility check (`npm view @pump-fun/pump-sdk`):
`@solana/web3.js ^1.98.2` and `@solana/spl-token ^0.4.13` - both compatible
with ZRP's existing pinned versions (`^1.98.4` / already on `0.4.x`), the
same compatibility bar the Raydium CPMM SDK was judged against earlier in
this mission before being integrated.

This is now the same risk category as the Raydium integration already
shipped in this phase: an official, actively maintained, dependency-
compatible package from the protocol's own publisher - not a reverse-
engineered guess.

## Why it is still not shipped in this phase

Integrating it properly is a distinct, large feature, not a small addition
to the liquidity work just shipped:

1. **A new trust boundary.** Bonding-curve buy/sell moves real SOL/USDC
   against a deterministic price function with real slippage and real fee
   mechanics that differ from CPMM swap math - getting the instruction
   construction, fee accounting, and slippage bounds wrong has the same
   real-money blast radius as the liquidity code just shipped, and deserves
   the same build→verify→test rigor, not a rushed addition at the end of
   an already-large session.
2. **No live RPC access in this working environment.** Every Solana-
   interacting feature in this mission (including the Raydium liquidity
   code just shipped) has been built and unit-tested with a mocked RPC,
   because this sandbox cannot reach Solana mainnet or devnet at all
   (confirmed: direct RPC calls to `api.mainnet-beta.solana.com` and
   `api.devnet.solana.com` both fail with a proxy-level connection
   rejection). A bonding-curve buy/sell/graduation flow needs the same
   mocked-RPC-unit-test treatment at minimum, and ideally a devnet smoke
   test before going live - exactly the verification step called for in
   this mission's own standards, which cannot be rushed in the time
   remaining in this session without compromising on it.
3. **Graduation-state tracking is its own subsystem.** "Report graduation
   only from verified chain state" (this mission's own requirement) means
   reading the bonding-curve account's real on-chain progress/completion
   flag and the resulting PumpSwap pool address after migration - a
   second indexer in the same shape as the volume/holder indexers just
   built, not a one-line addition.

## Concrete phase-2 plan (not generic - this is buildable today)

Following the exact pattern already proven for Raydium CPMM in this phase:

1. `npm install @pump-fun/pump-sdk` (official, MIT, verified compatible
   dependency tree - same diligence already applied to
   `@raydium-io/raydium-sdk-v2`).
2. `src/lib/launchpad/pump-curve-keys.ts` - pure, offline PDA/account
   derivation from the SDK's exported constants (mirrors
   `cpmm-keys.ts`).
3. `src/lib/launchpad/client-bonding-curve.ts` - wallet-signed buy/sell
   transaction builders + broadcast/confirm wrapper with an
   `AmbiguousTradeError` class (mirrors `client-liquidity.ts`).
4. `src/lib/launchpad/bonding-curve-service.ts` (server) - independent
   verification of a reported buy/sell signature against the real
   transaction, and a `readBondingCurveState()` function that reads the
   live curve account (virtual/real reserves, completion flag) directly
   from chain - never from a cached percentage.
5. New Prisma models, exactly the shape this mission's own master prompt
   named as examples: `BondingCurveState` (a cache of the last-read
   on-chain curve account, re-read on every request that needs current
   progress, never trusted as authoritative between reads) and
   `GraduationEvent` (recorded only after independently verifying the
   curve's on-chain completion flag and the resulting PumpSwap pool
   address exist).
6. `src/app/api/cron/launchpad-bonding-curve-sync/route.ts` - same
   `isAuthorizedCronRequest` pattern as `launchpad-volume-sync`, tracking
   graduation transitions.
7. Full mocked-RPC unit test suite (instruction construction, buy/sell
   math, graduation detection) before any UI is wired up - matching how
   `client-token-mint.ts`, `client-liquidity.ts` and
   `raydium-pool-service.ts` were each tested in this mission.

## What ships instead, today

Real liquidity for any SPL/Token-2022 token - including ones that would
otherwise need a pre-graduation bonding curve - via the Raydium CPMM
integration shipped in this same phase: real pool creation, real add/
remove liquidity, real LP burn, all wallet-signed against Raydium's
existing audited public program, all independently verified on-chain
before being recorded. A token launched on ZRP today can have real,
immediately-tradable liquidity without waiting on bonding-curve
graduation at all - a different path to the same end state (a liquid,
tradable token), not a lesser one.

## Update: the bonding curve was built in a later session

Everything above was this document's original conclusion. A follow-up
session built the integration this section once deferred, after
confirming `@pump-fun/pump-sdk` is the project's actively-maintained,
official package. What actually shipped differs in a few ways from the
plan sketched above - recorded here so this file stays an accurate map of
the real code, not a stale proposal next to it:

- **Files**: `src/lib/launchpad/pump-curve-keys.ts` (pure PDA/math, as
  planned), `src/lib/launchpad/pump-curve-service.ts` (not
  `bonding-curve-service.ts` - server-side live reads + independent
  buy/sell/graduation verification), `src/lib/launchpad/client-bonding-curve.ts`
  (wallet-signed buy/sell, as planned, built entirely on the SDK's own
  `PumpSdk.buyInstructions`/`sellInstructions` rather than hand-assembled
  instructions - a wrong account in hand-rolled buy/sell code risks real
  fund loss in a way a wrong account in a read-only decode never does).
- **No `BondingCurveState` table.** Curve state is read live from chain on
  every request with a 30s in-process cache for the `Global`/`FeeConfig`
  singletons only (mirrors `token-analytics.ts`'s own cache) - never
  persisted as a row that could silently go stale between reads.
  `GraduationEvent` is the one new on-chain-state table, recorded only
  after independently reading the curve's own `complete` flag.
- **Historical price/volume/liquidity/holder data** lives in a new
  `AnalyticsSnapshot` table (one row per mint per cron tick, not per
  curve-state read), covering both Raydium pool-based tokens and pump
  bonding-curve tokens uniformly.
- **Scope**: only the classic, legacy SOL-quoted curve (`buy`/`sell`,
  `PublicKey.default`/`NATIVE_MINT` quote) is supported - mayhem-mode,
  holder-reward, cashback, and non-SOL quote-control curves are detected
  and reported as `UNSUPPORTED_CURVE_VARIANT` rather than mis-read or
  mis-traded. Post-graduation, this integration detects graduation and the
  resulting canonical PumpSwap pool's *existence*, but does not decode
  that pool's own reserves/liquidity (a separate `@pump-fun/pump-swap-sdk`
  integration, not built this session).
- **Token creation through the curve itself was not built.** This session
  covers discovering, pricing, and trading *existing* pump bonding-curve
  tokens non-custodially. Initiating a brand-new token via pump's own
  `createV2`/`createV2AndBuy` (new mint keypair, metadata upload, a
  first-buy transaction) is materially higher-risk, untestable-against-
  live-RPC code that was deliberately left out rather than rushed - see
  that session's final delivery report for the full reasoning.
