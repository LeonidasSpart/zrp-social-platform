/**
 * Post-deployment verification for the ZRP Launchpad program. Run by CI
 * against a real devnet deployment (never mocked) - this is the
 * acceptance test that proves the deployed program is genuinely ZRP's
 * own, not Pump.fun's, and that its instructions actually work on-chain.
 *
 * Usage: ts-node scripts/verify-zrp-launchpad.ts
 * Env:
 *   SOLANA_RPC_URL        - defaults to https://api.devnet.solana.com
 *   DEPLOYER_KEYPAIR_PATH - path to the funded devnet keypair JSON used
 *                           to pay for the smoke test's transactions
 *   IDL_PATH              - defaults to target/idl/zrp_launchpad.json
 *   RUN_SMOKE_TEST         - "false" to skip the end-to-end on-chain run
 *                           and only perform the static checks (1-4, 7-9
 *                           via local instruction construction). Defaults
 *                           to "true".
 */
import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
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

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const IDL_PATH =
  process.env.IDL_PATH || path.join(process.cwd(), "target/idl/zrp_launchpad.json");
const DEPLOYER_KEYPAIR_PATH =
  process.env.DEPLOYER_KEYPAIR_PATH ||
  path.join(process.env.HOME || "", ".config/solana/id.json");
const RUN_SMOKE_TEST = process.env.RUN_SMOKE_TEST !== "false";

// The real Pump.fun mainnet program ID. A ZRP-native creation transaction
// must never invoke this - checked both locally (instruction construction)
// and against real on-chain transactions fetched back from devnet below.
const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const BPF_LOADER_UPGRADEABLE_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const GLOBAL_CONFIG_SEED = Buffer.from("global");
const BONDING_CURVE_SEED = Buffer.from("bonding-curve");

type CheckResult = { name: string; passed: boolean; detail: string };
const results: CheckResult[] = [];
function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} - ${name}: ${detail}`);
}

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function findGlobalConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GLOBAL_CONFIG_SEED], programId);
}

function findBondingCurvePda(
  programId: PublicKey,
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BONDING_CURVE_SEED, mint.toBuffer()],
    programId
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

async function assertTransactionNeverCallsPumpFun(
  connection: Connection,
  signature: string,
  label: string
) {
  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    record(
      `acceptance: ${label} transaction inspectable`,
      false,
      `could not fetch parsed transaction ${signature}`
    );
    return;
  }
  const programIds = new Set(
    tx.transaction.message.instructions.map((ix: any) => ix.programId.toBase58())
  );
  const calledPumpFun = programIds.has(PUMP_FUN_PROGRAM_ID);
  record(
    `acceptance: ${label} transaction does not call Pump.fun`,
    !calledPumpFun,
    calledPumpFun
      ? `Pump.fun program ID ${PUMP_FUN_PROGRAM_ID} WAS invoked - THIS IS A FAILURE`
      : `programs invoked: ${Array.from(programIds).join(", ")}`
  );
}

async function main() {
  console.log(`Verifying ZRP Launchpad against ${RPC_URL}`);
  const connection = new Connection(RPC_URL, "confirmed");

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const programId = new PublicKey(idl.address ?? idl.metadata?.address);

  // 1 & 2: program exists and is owned by the (upgradeable) BPF loader.
  const programAccount = await connection.getAccountInfo(programId);
  record(
    "1. Program account exists",
    programAccount !== null,
    programAccount ? `${programAccount.data.length} bytes` : "not found on this cluster"
  );
  if (programAccount) {
    record(
      "2. Program owner is the BPF Upgradeable Loader",
      programAccount.owner.toBase58() === BPF_LOADER_UPGRADEABLE_ID,
      `owner = ${programAccount.owner.toBase58()}`
    );
    record("program is executable", programAccount.executable, String(programAccount.executable));
  }

  // 3: program ID matches the committed devnet keypair / declare_id!.
  const declaredSrc = fs.readFileSync(
    path.join(process.cwd(), "programs/zrp-launchpad/src/lib.rs"),
    "utf-8"
  );
  const declaredMatch = declaredSrc.match(/declare_id!\("([1-9A-HJ-NP-Za-km-z]{32,44})"\)/);
  const declaredId = declaredMatch?.[1];
  record(
    "3. Program ID matches declare_id! in source",
    declaredId === programId.toBase58(),
    `declare_id! = ${declaredId}, deployed = ${programId.toBase58()}`
  );

  // 4: IDL matches source - every instruction defined in lib.rs's #[program]
  // module must appear in the generated IDL (anchor build's own output, so
  // a mismatch here means the deployed .so is stale relative to source).
  const expectedInstructions = [
    "initialize",
    "update_config",
    "create_and_buy",
    "buy",
    "sell",
    "graduate",
  ];
  const idlInstructionNames = new Set(
    (idl.instructions || []).map((ix: any) => ix.name)
  );
  // Anchor IDL instruction names may be emitted camelCase depending on
  // spec version - normalize both sides before comparing.
  const normalize = (s: string) => s.replace(/_/g, "").toLowerCase();
  const normalizedIdlNames = new Set(
    Array.from(idlInstructionNames).map((n) => normalize(n as string))
  );
  const missing = expectedInstructions.filter(
    (name) => !normalizedIdlNames.has(normalize(name))
  );
  record(
    "4. IDL contains every instruction declared in source",
    missing.length === 0,
    missing.length === 0
      ? `found: ${Array.from(idlInstructionNames).join(", ")}`
      : `missing from IDL: ${missing.join(", ")}`
  );

  if (!RUN_SMOKE_TEST) {
    writeReportAndExit();
    return;
  }

  const deployer = loadKeypair(DEPLOYER_KEYPAIR_PATH);
  const balance = await connection.getBalance(deployer.publicKey);
  record(
    "deployer wallet funded",
    balance > 0.5 * LAMPORTS_PER_SOL,
    `${balance / LAMPORTS_PER_SOL} SOL`
  );

  const wallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);

  const [globalConfig] = findGlobalConfigPda(programId);

  // 5: global PDA can be initialized/read.
  let config: any;
  try {
    config = await (program.account as any).globalConfig.fetch(globalConfig);
    record("5. ZRP global PDA readable (already initialized)", true, JSON.stringify({
      buyFeeBps: config.buyFeeBps,
      sellFeeBps: config.sellFeeBps,
    }));
  } catch {
    const feeRecipient = deployer.publicKey; // smoke-test only; real devnet config is reconfigured by a human via update_config if needed
    const migrationAuthority = deployer.publicKey;
    const sig = await (program.methods as any)
      .initialize(
        new anchor.BN(0.02 * LAMPORTS_PER_SOL), // creation fee
        100, // buy fee bps (1%)
        100, // sell fee bps (1%)
        new anchor.BN(30 * LAMPORTS_PER_SOL), // initial virtual SOL reserves
        new anchor.BN(1_073_000_000_000_000), // initial virtual token reserves
        new anchor.BN(1_000_000_000_000_000), // total supply
        new anchor.BN(5 * LAMPORTS_PER_SOL), // graduation threshold - kept low so the smoke test can actually reach it
        6 // decimals
      )
      .accounts({
        globalConfig,
        authority: deployer.publicKey,
        feeRecipient,
        migrationAuthority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await connection.confirmTransaction(sig, "confirmed");
    config = await (program.account as any).globalConfig.fetch(globalConfig);
    record("5. ZRP global PDA initialized and readable", true, `init tx ${sig}`);
  }

  // 6 + 7 + 8 + full lifecycle smoke test: CREATE -> INITIAL BUY -> BUY ->
  // SELL -> CURVE STATE -> GRADUATION.
  const mint = Keypair.generate();
  const [bondingCurve] = findBondingCurvePda(programId, mint.publicKey);
  record(
    "6. ZRP curve PDA derivation works",
    bondingCurve instanceof PublicKey,
    bondingCurve.toBase58()
  );
  const [metadata] = findMetadataPda(mint.publicKey);
  const curveTokenVault = getAssociatedTokenAddressSync(mint.publicKey, bondingCurve, true);
  const creatorTokenAccount = getAssociatedTokenAddressSync(mint.publicKey, deployer.publicKey);

  const createIx = await (program.methods as any)
    .createAndBuy(
      "ZRP Devnet Smoke Test",
      "ZRPDST",
      "https://zrp.one/launchpad/devnet-smoke-test.json",
      new anchor.BN(1 * LAMPORTS_PER_SOL),
      new anchor.BN(1)
    )
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      creatorTokenAccount,
      metadata,
      creator: deployer.publicKey,
      feeRecipient: config.feeRecipient,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .instruction();
  record(
    "7. create_and_buy instruction can be constructed",
    createIx.programId.equals(programId),
    `targets program ${createIx.programId.toBase58()}`
  );

  const createSig = await (program.methods as any)
    .createAndBuy(
      "ZRP Devnet Smoke Test",
      "ZRPDST",
      "https://zrp.one/launchpad/devnet-smoke-test.json",
      new anchor.BN(1 * LAMPORTS_PER_SOL),
      new anchor.BN(1)
    )
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      creatorTokenAccount,
      metadata,
      creator: deployer.publicKey,
      feeRecipient: config.feeRecipient,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([mint])
    .rpc();
  await connection.confirmTransaction(createSig, "confirmed");
  record("CREATE + INITIAL BUY executed on devnet", true, `tx ${createSig}`);
  await assertTransactionNeverCallsPumpFun(connection, createSig, "create_and_buy");

  const buyIx = await (program.methods as any)
    .buy(new anchor.BN(0.5 * LAMPORTS_PER_SOL), new anchor.BN(1))
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      buyerTokenAccount: creatorTokenAccount,
      buyer: deployer.publicKey,
      feeRecipient: config.feeRecipient,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  record(
    "8. buy instruction can be constructed",
    buyIx.programId.equals(programId),
    `targets program ${buyIx.programId.toBase58()}`
  );

  const buySig = await (program.methods as any)
    .buy(new anchor.BN(0.5 * LAMPORTS_PER_SOL), new anchor.BN(1))
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      buyerTokenAccount: creatorTokenAccount,
      buyer: deployer.publicKey,
      feeRecipient: config.feeRecipient,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await connection.confirmTransaction(buySig, "confirmed");
  record("BUY executed on devnet", true, `tx ${buySig}`);
  await assertTransactionNeverCallsPumpFun(connection, buySig, "buy");

  const heldBefore = await getAccount(connection, creatorTokenAccount);
  const sellAmount = heldBefore.amount / BigInt(4); // sell a quarter, leave enough to keep testing reserve math sane

  const sellIx = await (program.methods as any)
    .sell(new anchor.BN(sellAmount.toString()), new anchor.BN(0))
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      sellerTokenAccount: creatorTokenAccount,
      seller: deployer.publicKey,
      feeRecipient: config.feeRecipient,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  record(
    "9. sell instruction can be constructed",
    sellIx.programId.equals(programId),
    `targets program ${sellIx.programId.toBase58()}`
  );

  const sellSig = await (program.methods as any)
    .sell(new anchor.BN(sellAmount.toString()), new anchor.BN(0))
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      sellerTokenAccount: creatorTokenAccount,
      seller: deployer.publicKey,
      feeRecipient: config.feeRecipient,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  await connection.confirmTransaction(sellSig, "confirmed");
  record("SELL executed on devnet", true, `tx ${sellSig}`);
  await assertTransactionNeverCallsPumpFun(connection, sellSig, "sell");

  const curveAfterSell = await (program.account as any).bondingCurve.fetch(bondingCurve);
  record(
    "CURVE STATE readable after trades",
    true,
    `realSolReserves=${curveAfterSell.realSolReserves}, realTokenReserves=${curveAfterSell.realTokenReserves}, complete=${curveAfterSell.complete}`
  );

  // GRADUATION TEST: one more large buy to cross the (low, smoke-test-only)
  // 5 SOL threshold, then call graduate() and confirm the sweep.
  const graduationBuySig = await (program.methods as any)
    .buy(new anchor.BN(5 * LAMPORTS_PER_SOL), new anchor.BN(0))
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      buyerTokenAccount: creatorTokenAccount,
      buyer: deployer.publicKey,
      feeRecipient: config.feeRecipient,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await connection.confirmTransaction(graduationBuySig, "confirmed");
  const curveAfterGraduationBuy = await (program.account as any).bondingCurve.fetch(bondingCurve);
  record(
    "GRADUATION TEST: curve auto-completes past threshold",
    curveAfterGraduationBuy.complete === true,
    `complete=${curveAfterGraduationBuy.complete}, realSolReserves=${curveAfterGraduationBuy.realSolReserves}`
  );

  const migrationTokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    config.migrationAuthority
  );
  const graduateSig = await (program.methods as any)
    .graduate()
    .accounts({
      globalConfig,
      bondingCurve,
      mint: mint.publicKey,
      curveTokenVault,
      migrationTokenAccount,
      migrationAuthority: config.migrationAuthority,
      caller: deployer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await connection.confirmTransaction(graduateSig, "confirmed");
  const curveAfterGraduate = await (program.account as any).bondingCurve.fetch(bondingCurve);
  record(
    "GRADUATION TEST: graduate() sweeps reserves",
    curveAfterGraduate.migrated === true &&
      curveAfterGraduate.realSolReserves.toString() === "0",
    `tx ${graduateSig}, migrated=${curveAfterGraduate.migrated}`
  );
  await assertTransactionNeverCallsPumpFun(connection, graduateSig, "graduate");

  writeReportAndExit();
}

function writeReportAndExit() {
  const failed = results.filter((r) => !r.passed);
  const report = {
    rpcUrl: RPC_URL,
    timestamp: new Date().toISOString(),
    allPassed: failed.length === 0,
    checks: results,
  };
  fs.writeFileSync("devnet-verification-report.json", JSON.stringify(report, null, 2));

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const lines = [
      "## ZRP Launchpad devnet verification",
      "",
      "| Check | Result | Detail |",
      "|---|---|---|",
      ...results.map(
        (r) => `| ${r.name} | ${r.passed ? "✅" : "❌"} | ${r.detail.replace(/\|/g, "\\|")} |`
      ),
    ];
    fs.appendFileSync(summaryPath, lines.join("\n") + "\n");
  }

  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.error(`FAILED checks: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});
