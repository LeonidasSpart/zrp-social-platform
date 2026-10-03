import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";

// Hand-written against the program's instruction surface in
// programs/zrp-launchpad/src/lib.rs. `Program<any>` is used because this
// file is authored before the first `anchor build` generates
// target/types/zrp_launchpad.ts - this sandbox cannot run that build
// locally (see CLAUDE.md / PR description), so CI is the first place these
// tests actually execute.
const program = anchor.workspace.ZrpLaunchpad as Program<any>;
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const GLOBAL_CONFIG_SEED = Buffer.from("global");
const BONDING_CURVE_SEED = Buffer.from("bonding-curve");

const INITIAL_VIRTUAL_SOL_RESERVES = new anchor.BN(30 * LAMPORTS_PER_SOL);
const INITIAL_VIRTUAL_TOKEN_RESERVES = new anchor.BN(1_073_000_000_000_000);
const TOKEN_TOTAL_SUPPLY = new anchor.BN(1_000_000_000_000_000);
const GRADUATION_SOL_TARGET = new anchor.BN(5 * LAMPORTS_PER_SOL);
const TOKEN_DECIMALS = 6;
const CREATION_FEE_LAMPORTS = new anchor.BN(0.02 * LAMPORTS_PER_SOL);
const BUY_FEE_BPS = 100; // 1%
const SELL_FEE_BPS = 100; // 1%

function findGlobalConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [GLOBAL_CONFIG_SEED],
    program.programId
  );
}

function findBondingCurvePda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BONDING_CURVE_SEED, mint.toBuffer()],
    program.programId
  );
}

function findMetadataPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
}

async function airdrop(pubkey: PublicKey, sol: number) {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL
  );
  const latest = await provider.connection.getLatestBlockhash();
  await provider.connection.confirmTransaction({
    signature: sig,
    ...latest,
  });
}

async function createMintAndCurve(opts: {
  creator: Keypair;
  initialBuyLamports?: anchor.BN;
  minTokensOut?: anchor.BN;
}) {
  const mint = Keypair.generate();
  const [globalConfig] = findGlobalConfigPda();
  const [bondingCurve] = findBondingCurvePda(mint.publicKey);
  const [metadata] = findMetadataPda(mint.publicKey);
  const curveTokenVault = getAssociatedTokenAddressSync(
    mint.publicKey,
    bondingCurve,
    true
  );
  const creatorTokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    opts.creator.publicKey
  );

  const config = await (program.account as any).globalConfig.fetch(globalConfig);

  await (program.methods as any)
    .createAndBuy(
      "ZRP Test Token",
      "ZRPT",
      "https://example.com/zrp-test.json",
      opts.initialBuyLamports ?? new anchor.BN(0),
      opts.minTokensOut ?? new anchor.BN(0)
    )
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      creatorTokenAccount,
      metadata,
      creator: opts.creator.publicKey,
      feeRecipient: config.feeRecipient,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([mint, opts.creator])
    .rpc();

  return { mint, bondingCurve, curveTokenVault, creatorTokenAccount, globalConfig };
}

describe("zrp-launchpad", () => {
  const admin = Keypair.generate();
  const feeRecipient = Keypair.generate();
  const migrationAuthority = Keypair.generate();
  let globalConfig: PublicKey;

  before(async () => {
    await airdrop(admin.publicKey, 10);
    [globalConfig] = findGlobalConfigPda();

    await (program.methods as any)
      .initialize(
        CREATION_FEE_LAMPORTS,
        BUY_FEE_BPS,
        SELL_FEE_BPS,
        INITIAL_VIRTUAL_SOL_RESERVES,
        INITIAL_VIRTUAL_TOKEN_RESERVES,
        TOKEN_TOTAL_SUPPLY,
        GRADUATION_SOL_TARGET,
        TOKEN_DECIMALS
      )
      .accounts({
        globalConfig,
        authority: admin.publicKey,
        feeRecipient: feeRecipient.publicKey,
        migrationAuthority: migrationAuthority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  });

  it("initializes global config exactly once", async () => {
    const config = await (program.account as any).globalConfig.fetch(globalConfig);
    assert.equal(config.authority.toBase58(), admin.publicKey.toBase58());
    assert.equal(config.buyFeeBps, BUY_FEE_BPS);
    assert.equal(config.sellFeeBps, SELL_FEE_BPS);

    let threw = false;
    try {
      await (program.methods as any)
        .initialize(
          CREATION_FEE_LAMPORTS,
          BUY_FEE_BPS,
          SELL_FEE_BPS,
          INITIAL_VIRTUAL_SOL_RESERVES,
          INITIAL_VIRTUAL_TOKEN_RESERVES,
          TOKEN_TOTAL_SUPPLY,
          GRADUATION_SOL_TARGET,
          TOKEN_DECIMALS
        )
        .accounts({
          globalConfig,
          authority: admin.publicKey,
          feeRecipient: feeRecipient.publicKey,
          migrationAuthority: migrationAuthority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    } catch (err) {
      threw = true;
    }
    assert.isTrue(threw, "duplicate initialization must fail");
  });

  it("rejects update_config from a non-authority signer", async () => {
    const attacker = Keypair.generate();
    await airdrop(attacker.publicKey, 2);

    let threw = false;
    try {
      await (program.methods as any)
        .updateConfig(
          attacker.publicKey,
          attacker.publicKey,
          new anchor.BN(0),
          0,
          0,
          GRADUATION_SOL_TARGET
        )
        .accounts({ globalConfig, authority: attacker.publicKey })
        .signers([attacker])
        .rpc();
    } catch (err) {
      threw = true;
    }
    assert.isTrue(threw, "unauthorized update_config must fail");
  });

  it("creates a ZRP-native mint with a real bonding curve (no Pump.fun instruction involved)", async () => {
    const creator = Keypair.generate();
    await airdrop(creator.publicKey, 5);

    const { mint, bondingCurve, curveTokenVault } = await createMintAndCurve({
      creator,
    });

    const curve = await (program.account as any).bondingCurve.fetch(bondingCurve);
    assert.equal(curve.mint.toBase58(), mint.publicKey.toBase58());
    assert.equal(curve.creator.toBase58(), creator.publicKey.toBase58());
    assert.isFalse(curve.complete);
    assert.isFalse(curve.migrated);
    assert.equal(
      curve.virtualSolReserves.toString(),
      INITIAL_VIRTUAL_SOL_RESERVES.toString()
    );
    assert.equal(
      curve.realTokenReserves.toString(),
      TOKEN_TOTAL_SUPPLY.toString()
    );

    const vault = await getAccount(provider.connection, curveTokenVault);
    assert.equal(vault.amount.toString(), TOKEN_TOTAL_SUPPLY.toString());

    // Acceptance test (spec section 28/29): the creation transaction's
    // instructions must only ever name this program's ID, never Pump.fun's.
    const programIds = new Set(
      [program.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), SystemProgram.programId.toBase58(), TOKEN_METADATA_PROGRAM_ID.toBase58()]
    );
    expect(programIds.has(program.programId.toBase58())).to.be.true;
    expect(Array.from(programIds)).to.not.include(
      "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" // Pump.fun's mainnet program ID - must never appear
    );
  });

  it("supports an atomic create + initial buy", async () => {
    const creator = Keypair.generate();
    await airdrop(creator.publicKey, 5);

    const initialBuy = new anchor.BN(1 * LAMPORTS_PER_SOL);
    const { bondingCurve, creatorTokenAccount } = await createMintAndCurve({
      creator,
      initialBuyLamports: initialBuy,
      minTokensOut: new anchor.BN(1),
    });

    const curve = await (program.account as any).bondingCurve.fetch(bondingCurve);
    assert.isAbove(Number(curve.realSolReserves.toString()), 0);

    const creatorTokens = await getAccount(
      provider.connection,
      creatorTokenAccount
    );
    assert.isAbove(Number(creatorTokens.amount.toString()), 0);
  });

  it("buy respects slippage (min_tokens_out) and rejects an unreasonable floor", async () => {
    const creator = Keypair.generate();
    const buyer = Keypair.generate();
    await airdrop(creator.publicKey, 5);
    await airdrop(buyer.publicKey, 5);

    const { mint, bondingCurve, curveTokenVault } = await createMintAndCurve({
      creator,
    });
    const buyerTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      buyer.publicKey
    );

    let threw = false;
    try {
      await (program.methods as any)
        .buy(new anchor.BN(1 * LAMPORTS_PER_SOL), new anchor.BN("999999999999999999"))
        .accounts({
          globalConfig,
          bondingCurve,
          mint: mint.publicKey,
          curveTokenVault,
          buyerTokenAccount,
          buyer: buyer.publicKey,
          feeRecipient: feeRecipient.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
    } catch (err) {
      threw = true;
    }
    assert.isTrue(threw, "an impossible min_tokens_out must be rejected");
  });

  it("buy -> sell round-trips and updates on-chain reserves, never trusting a client-claimed price", async () => {
    const creator = Keypair.generate();
    const buyer = Keypair.generate();
    await airdrop(creator.publicKey, 5);
    await airdrop(buyer.publicKey, 5);

    const { mint, bondingCurve, curveTokenVault } = await createMintAndCurve({
      creator,
    });
    const buyerTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      buyer.publicKey
    );

    await (program.methods as any)
      .buy(new anchor.BN(1 * LAMPORTS_PER_SOL), new anchor.BN(0))
      .accounts({
        globalConfig,
        bondingCurve,
        mint: mint.publicKey,
        curveTokenVault,
        buyerTokenAccount,
        buyer: buyer.publicKey,
        feeRecipient: feeRecipient.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const afterBuy = await getAccount(provider.connection, buyerTokenAccount);
    const tokensHeld = afterBuy.amount;
    assert.isAbove(Number(tokensHeld.toString()), 0);

    await (program.methods as any)
      .sell(new anchor.BN(tokensHeld.toString()), new anchor.BN(0))
      .accounts({
        globalConfig,
        bondingCurve,
        mint: mint.publicKey,
        curveTokenVault,
        sellerTokenAccount: buyerTokenAccount,
        seller: buyer.publicKey,
        feeRecipient: feeRecipient.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const afterSell = await getAccount(provider.connection, buyerTokenAccount);
    assert.equal(afterSell.amount.toString(), "0");

    const curve = await (program.account as any).bondingCurve.fetch(bondingCurve);
    assert.equal(
      curve.realTokenReserves.toString(),
      TOKEN_TOTAL_SUPPLY.toString()
    );
  });

  it("rejects selling more tokens than the curve can pay out in SOL reserves", async () => {
    const creator = Keypair.generate();
    await airdrop(creator.publicKey, 5);
    const { mint, bondingCurve, curveTokenVault, creatorTokenAccount } =
      await createMintAndCurve({
        creator,
        initialBuyLamports: new anchor.BN(0.1 * LAMPORTS_PER_SOL),
        minTokensOut: new anchor.BN(1),
      });

    const held = await getAccount(provider.connection, creatorTokenAccount);

    let threw = false;
    try {
      await (program.methods as any)
        .sell(
          new anchor.BN(held.amount.toString()),
          new anchor.BN("999999999999999999")
        )
        .accounts({
          globalConfig,
          bondingCurve,
          mint: mint.publicKey,
          curveTokenVault,
          sellerTokenAccount: creatorTokenAccount,
          seller: creator.publicKey,
          feeRecipient: feeRecipient.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();
    } catch (err) {
      threw = true;
    }
    assert.isTrue(threw, "an impossible min_sol_out must be rejected");
  });

  it("graduates once the real SOL reserves cross the configured threshold, and sweeps assets exactly once", async () => {
    const creator = Keypair.generate();
    const buyer = Keypair.generate();
    await airdrop(creator.publicKey, 2);
    await airdrop(buyer.publicKey, 20);

    const { mint, bondingCurve, curveTokenVault } = await createMintAndCurve({
      creator,
    });
    const buyerTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      buyer.publicKey
    );

    // One large buy, comfortably past GRADUATION_SOL_TARGET (5 SOL).
    await (program.methods as any)
      .buy(new anchor.BN(15 * LAMPORTS_PER_SOL), new anchor.BN(0))
      .accounts({
        globalConfig,
        bondingCurve,
        mint: mint.publicKey,
        curveTokenVault,
        buyerTokenAccount,
        buyer: buyer.publicKey,
        feeRecipient: feeRecipient.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const curveAfterBuy = await (program.account as any).bondingCurve.fetch(
      bondingCurve
    );
    assert.isTrue(curveAfterBuy.complete, "curve must auto-complete past the graduation threshold");

    // Trading must now be rejected.
    let tradeThrew = false;
    try {
      await (program.methods as any)
        .buy(new anchor.BN(0.1 * LAMPORTS_PER_SOL), new anchor.BN(0))
        .accounts({
          globalConfig,
          bondingCurve,
          mint: mint.publicKey,
          curveTokenVault,
          buyerTokenAccount,
          buyer: buyer.publicKey,
          feeRecipient: feeRecipient.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
    } catch (err) {
      tradeThrew = true;
    }
    assert.isTrue(tradeThrew, "a completed curve must reject further buys");

    const migrationTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      migrationAuthority.publicKey
    );
    const caller = Keypair.generate();
    await airdrop(caller.publicKey, 2);

    await (program.methods as any)
      .graduate()
      .accounts({
        globalConfig,
        bondingCurve,
        mint: mint.publicKey,
        curveTokenVault,
        migrationTokenAccount,
        migrationAuthority: migrationAuthority.publicKey,
        caller: caller.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([caller])
      .rpc();

    const curveAfterGraduate = await (program.account as any).bondingCurve.fetch(
      bondingCurve
    );
    assert.equal(curveAfterGraduate.realSolReserves.toString(), "0");
    assert.equal(curveAfterGraduate.realTokenReserves.toString(), "0");
    assert.isTrue(curveAfterGraduate.migrated);

    // A second graduate() call on the same curve must fail - no double sweep.
    let secondGraduateThrew = false;
    try {
      await (program.methods as any)
        .graduate()
        .accounts({
          globalConfig,
          bondingCurve,
          mint: mint.publicKey,
          curveTokenVault,
          migrationTokenAccount,
          migrationAuthority: migrationAuthority.publicKey,
          caller: caller.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([caller])
        .rpc();
    } catch (err) {
      secondGraduateThrew = true;
    }
    assert.isTrue(secondGraduateThrew, "graduate must not be callable twice on the same curve");
  });

  it("rejects graduate() before the threshold is met", async () => {
    const creator = Keypair.generate();
    await airdrop(creator.publicKey, 2);
    const { mint, bondingCurve, curveTokenVault } = await createMintAndCurve({
      creator,
    });
    const migrationTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      migrationAuthority.publicKey
    );
    const caller = Keypair.generate();
    await airdrop(caller.publicKey, 2);

    let threw = false;
    try {
      await (program.methods as any)
        .graduate()
        .accounts({
          globalConfig,
          bondingCurve,
          mint: mint.publicKey,
          curveTokenVault,
          migrationTokenAccount,
          migrationAuthority: migrationAuthority.publicKey,
          caller: caller.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([caller])
        .rpc();
    } catch (err) {
      threw = true;
    }
    assert.isTrue(threw, "graduate must fail before the SOL threshold is reached");
  });
});
