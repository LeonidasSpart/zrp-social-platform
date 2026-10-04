# ZRP Launchpad - build, test, and deployment

This documents how `programs/zrp-launchpad/` (ZRP's own, fully independent
bonding-curve token-creation protocol) is built, tested, and deployed.
The development sandbox this repo is normally edited in has no network
path to crates.io or any Solana RPC endpoint, so none of
this can be verified locally - `.github/workflows/solana-program-ci.yml`
is the real build/test/deploy oracle, the same role GitHub Actions already
plays for `android-native-build.yml`.

## Pipeline stages

| Job | Trigger | What it does | Funds at risk |
|---|---|---|---|
| `build-and-test` | every PR, push to `main`, manual | `anchor build` + the full `tests/zrp-launchpad.ts` suite against a fresh local-validator (with Metaplex Token Metadata cloned in from mainnet) | none |
| `deploy-devnet` | push to `main` only | Deploys/upgrades the program on Solana **devnet** using the committed devnet identity keypair | devnet SOL only (worthless) |
| `verify-devnet` | after `deploy-devnet` | Confirms the deployed program (owner, ID, IDL) and runs a full real on-chain smoke test: create → initial buy → buy → sell → curve state → graduation | devnet SOL only (worthless) |
| `deploy-mainnet` | **manual only** (`workflow_dispatch`), requires typing the exact confirmation phrase | Builds with the mainnet program identity, deploys to `mainnet-beta`, then re-verifies `declare_id!` match, executable status, and on-chain upgrade authority before reporting success | **real SOL** |

## Required secrets

| Secret | Required for | Notes |
|---|---|---|
| `SOLANA_RPC_URL` | devnet jobs (optional) | A dedicated devnet RPC endpoint. Falls back to the public `https://api.devnet.solana.com` if unset - fine occasionally, but that endpoint rate-limits shared CI IP ranges under repeated use. |
| `SOLANA_DEPLOYER_KEYPAIR` | devnet jobs (optional, strongly recommended) | A persistent devnet keypair (JSON array of 64 bytes, the standard `solana-keygen` format), pre-funded by a human once. Falls back to a fresh ephemeral keypair + CI-driven faucet airdrop if unset, which works but is flaky under heavier use. **This is a devnet-only wallet - never reuse a mainnet key here.** |
| `SOLANA_MAINNET_PROGRAM_KEYPAIR` | `deploy-mainnet` (**required**) | The program's permanent on-chain identity for mainnet (its pubkey becomes the real `declare_id!`). Generate this **once**, store it only as this secret, and never commit it. This key does **not** hold upgrade authority - see the deployer row below. |
| `SOLANA_MAINNET_DEPLOYER_KEYPAIR` | `deploy-mainnet` (**required**) | Pays the mainnet deploy's rent/fees (typically ~3-6 SOL for a program this size) and is explicitly set (and verified on-chain) as upgrade authority, kept separate from the program identity key so authority can be rotated (e.g. to a multisig) later without touching the program's permanent address. Must be funded with **real SOL** by a human before running the job. **Never reuse the devnet deployer wallet for this.** |

Never commit a private key, seed phrase, wallet JSON file, RPC credential,
or deployment credential to this repository. The only key material
committed here is `programs/zrp-launchpad/keys/zrp-launchpad-devnet-keypair.json`
- deliberately devnet-only, where the funds it could ever touch are
worthless by design.

### Generating the mainnet secrets (one-time, by a human, outside CI)

```bash
# Program identity - generate once, store as SOLANA_MAINNET_PROGRAM_KEYPAIR,
# never reuse, never commit.
solana-keygen new --no-bip39-passphrase --outfile mainnet-program-keypair.json
cat mainnet-program-keypair.json   # paste this JSON array as the secret value, then delete the file

# Deployer wallet - fund with real SOL before the first mainnet deploy.
solana-keygen new --no-bip39-passphrase --outfile mainnet-deployer-keypair.json
solana-keygen pubkey mainnet-deployer-keypair.json   # send SOL to this address
cat mainnet-deployer-keypair.json   # paste as SOLANA_MAINNET_DEPLOYER_KEYPAIR, then delete the file
```

Add both as repository secrets (Settings → Secrets and variables → Actions)
before ever running the `deploy-mainnet` job.

## Deploying to devnet

Automatic: every push to `main` that touches `programs/**` runs
`deploy-devnet` then `verify-devnet`. No manual action needed. Check the
run's job summary for the deployed program ID and the verification
report's pass/fail table.

## Deploying to mainnet (manual, controlled)

1. Confirm `build-and-test` and `verify-devnet` are green on the commit
   you intend to ship - **never** run `deploy-mainnet` from a commit that
   hasn't passed devnet verification first.
2. Confirm `SOLANA_MAINNET_PROGRAM_KEYPAIR` and `SOLANA_MAINNET_DEPLOYER_KEYPAIR`
   are set, and the deployer wallet holds enough real SOL (the job checks
   this and fails closed if it looks too low).
3. Go to **Actions → ZRP Launchpad Solana Program → Run workflow**.
4. In `confirm_mainnet_deploy`, type exactly:
   ```
   DEPLOY ZRP LAUNCHPAD TO MAINNET
   ```
   Any other value (including leaving it blank) runs `build-and-test` only
   - this is deliberately not a checkbox, so it can't be triggered by habit
   or muscle memory.
5. After deploy, the job itself re-verifies (not just assumes) three things
   on-chain before reporting success: `declare_id!` in the built source
   matches `SOLANA_MAINNET_PROGRAM_KEYPAIR`'s pubkey, the program account
   is executable, and the on-chain upgrade authority equals the deployer
   wallet. Any mismatch fails the job rather than reporting a success that
   wasn't actually confirmed. The job's summary then reports the real,
   deployed mainnet program ID, the verified upgrade authority, and
   uploads the IDL/types as the `zrp-launchpad-mainnet-deploy` artifact.
6. Record the reported program ID as `ZRP_LAUNCH_PROGRAM_ID` /
   `NEXT_PUBLIC_ZRP_LAUNCH_PROGRAM_ID` in the application's environment
   configuration (see README.md's Configuration section) - **the
   application must never ship with an invented or placeholder mainnet
   program ID; only the ID this job actually reports.** Both
   `src/lib/launchpad/zrp-launch-keys.ts` and `src/lib/solana-client.ts`
   now fail closed (throw at runtime) in production if this var, or
   `NEXT_PUBLIC_SOLANA_RPC_URL`/`SOLANA_RPC_URL`, are left unset - a
   misconfigured prod deploy refuses to silently run against devnet
   instead of working but pointed at the wrong network.

This workflow never deploys to mainnet on its own - `deploy-mainnet`'s
`if:` condition requires both `workflow_dispatch` and the exact typed
phrase, so no push, PR, or schedule can trigger it.

## Known limitation: post-graduation Raydium liquidity is not yet automatic

When a `ZRP_LAUNCH` token graduates (`graduate()` sweeps the bonding
curve's reserves to the migration authority), `GraduationEvent.poolAddress`
is recorded as `null` - ZRP does not yet automatically seed a Raydium pool
with the swept reserves (`src/app/api/launchpad/tokens/[mint]/graduation/route.ts`).
The migration authority receives the real SOL/tokens; creating the
downstream Raydium pool today requires the existing manual
`pools/create`/`liquidity/add` routes. This is a deliberate, previously
scoped follow-up phase, not a regression - tracked here so it isn't
mistaken for a broken graduation flow once real mainnet tokens start
graduating.

## Acceptance test: this program is fully independent

Both `tests/zrp-launchpad.ts` (local-validator) and `scripts/verify-zrp-launchpad.ts`
(real devnet) assert that every transaction produced by this program's
`create_and_buy`/`buy`/`sell`/`graduate` instructions only ever invokes
this program's own instructions - no other, external program ID. The
devnet script fetches the *actual* confirmed on-chain transaction and
inspects every instruction's program ID - not a mock, not a local
construction check alone.
