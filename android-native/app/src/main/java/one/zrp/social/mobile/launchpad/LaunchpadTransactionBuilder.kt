package one.zrp.social.mobile.launchpad

import java.math.BigInteger
import one.zrp.social.mobile.solana.SolanaPublicKey
import one.zrp.social.mobile.solana.SolanaTransactionCompiler
import one.zrp.social.mobile.solana.SolanaTransactionCompiler.AccountMeta
import one.zrp.social.mobile.solana.SolanaTransactionCompiler.CompiledInstruction
import one.zrp.social.mobile.solana.ZrpLaunchpad

/**
 * Assembles the exact unsigned transaction bytes for ZRP Launchpad's
 * create_and_buy/buy/sell instructions - the Kotlin counterpart of
 * src/lib/launchpad/client-zrp-launch.ts's createZrpTokenFromBrowser/
 * buyOnZrpCurve/sellOnZrpCurve. Every account list below is copied
 * field-for-field, in the same order, from that file (read directly, not
 * from memory) so this produces byte-identical instructions to what the
 * already-live web client sends - the same program, same accounts, same
 * Borsh-encoded args, just signed by Mobile Wallet Adapter instead of an
 * injected browser wallet.
 *
 * Pure and offline except for the one piece no client can derive itself:
 * GlobalConfig.feeRecipient and the program ID currently in effect, both
 * read from GET /api/launchpad/zrp/global-config (see
 * LaunchpadRepository.getZrpGlobalConfig) rather than this app holding
 * its own RPC connection or hardcoded program ID - see that route's own
 * comment for why.
 */
object LaunchpadTransactionBuilder {
    val TOKEN_PROGRAM_ID = SolanaPublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    val ASSOCIATED_TOKEN_PROGRAM_ID = SolanaPublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    val SYSTEM_PROGRAM_ID = SolanaPublicKey("11111111111111111111111111111111")
    val SYSVAR_RENT_PUBKEY = SolanaPublicKey("SysvarRent111111111111111111111111111111111")

    /** Mirrors @solana/spl-token's getAssociatedTokenAddressSync exactly - the ATA PDA is seeded by [owner, tokenProgram, mint] under the Associated Token Program. */
    fun findAssociatedTokenAddress(mint: SolanaPublicKey, owner: SolanaPublicKey): SolanaPublicKey =
        SolanaPublicKey.findProgramAddress(
            seeds = listOf(owner.bytes, TOKEN_PROGRAM_ID.bytes, mint.bytes),
            programId = ASSOCIATED_TOKEN_PROGRAM_ID,
        ).first

    /**
     * Context for create_and_buy - mintKeypairPublicKey is the public key
     * of a freshly generated Keypair the caller holds, which must
     * co-sign the compiled transaction (it is not something Mobile
     * Wallet Adapter's connected wallet can sign, since the wallet never
     * sees that keypair's private key - see SolanaWalletConnector.kt's
     * own note on needing the real MWA 2.x multi-signer surface
     * confirmed before this ships. The caller partially-signs with it
     * locally before handing the bytes to MWA).
     */
    fun buildCreateAndBuyInstruction(
        owner: SolanaPublicKey,
        mintKeypairPublicKey: SolanaPublicKey,
        name: String,
        symbol: String,
        metadataUri: String,
        initialBuyLamports: BigInteger,
        minTokensOut: BigInteger,
        feeRecipient: SolanaPublicKey,
        programId: SolanaPublicKey,
    ): CompiledInstruction {
        val keys = ZrpLaunchpad.deriveZrpLaunchKeys(mintKeypairPublicKey, programId)
        val curveTokenVault = findAssociatedTokenAddress(mintKeypairPublicKey, keys.bondingCurve)
        val creatorTokenAccount = findAssociatedTokenAddress(mintKeypairPublicKey, owner)
        val data = ZrpLaunchpad.encodeCreateAndBuyIx(name, symbol, metadataUri, initialBuyLamports, minTokensOut)

        return CompiledInstruction(
            programId = programId,
            accounts = listOf(
                AccountMeta(keys.globalConfig, isSigner = false, isWritable = false),
                AccountMeta(keys.bondingCurve, isSigner = false, isWritable = true),
                AccountMeta(mintKeypairPublicKey, isSigner = true, isWritable = true),
                AccountMeta(curveTokenVault, isSigner = false, isWritable = true),
                AccountMeta(creatorTokenAccount, isSigner = false, isWritable = true),
                AccountMeta(keys.metadata, isSigner = false, isWritable = true),
                AccountMeta(owner, isSigner = true, isWritable = true),
                AccountMeta(feeRecipient, isSigner = false, isWritable = true),
                AccountMeta(ZrpLaunchpad.TOKEN_METADATA_PROGRAM_ID, isSigner = false, isWritable = false),
                AccountMeta(TOKEN_PROGRAM_ID, isSigner = false, isWritable = false),
                AccountMeta(ASSOCIATED_TOKEN_PROGRAM_ID, isSigner = false, isWritable = false),
                AccountMeta(SYSTEM_PROGRAM_ID, isSigner = false, isWritable = false),
                AccountMeta(SYSVAR_RENT_PUBKEY, isSigner = false, isWritable = false),
            ),
            data = data,
        )
    }

    fun buildBuyInstruction(
        owner: SolanaPublicKey,
        mint: SolanaPublicKey,
        solLamports: BigInteger,
        minTokensOut: BigInteger,
        feeRecipient: SolanaPublicKey,
        programId: SolanaPublicKey,
    ): CompiledInstruction {
        val keys = ZrpLaunchpad.deriveZrpLaunchKeys(mint, programId)
        val curveTokenVault = findAssociatedTokenAddress(mint, keys.bondingCurve)
        val buyerTokenAccount = findAssociatedTokenAddress(mint, owner)
        val data = ZrpLaunchpad.encodeBuyIx(solLamports, minTokensOut)

        return CompiledInstruction(
            programId = programId,
            accounts = listOf(
                AccountMeta(keys.globalConfig, isSigner = false, isWritable = false),
                AccountMeta(keys.bondingCurve, isSigner = false, isWritable = true),
                AccountMeta(mint, isSigner = false, isWritable = false),
                AccountMeta(curveTokenVault, isSigner = false, isWritable = true),
                AccountMeta(buyerTokenAccount, isSigner = false, isWritable = true),
                AccountMeta(owner, isSigner = true, isWritable = true),
                AccountMeta(feeRecipient, isSigner = false, isWritable = true),
                AccountMeta(TOKEN_PROGRAM_ID, isSigner = false, isWritable = false),
                AccountMeta(ASSOCIATED_TOKEN_PROGRAM_ID, isSigner = false, isWritable = false),
                AccountMeta(SYSTEM_PROGRAM_ID, isSigner = false, isWritable = false),
            ),
            data = data,
        )
    }

    fun buildSellInstruction(
        owner: SolanaPublicKey,
        mint: SolanaPublicKey,
        tokenAmountRaw: BigInteger,
        minSolOut: BigInteger,
        feeRecipient: SolanaPublicKey,
        programId: SolanaPublicKey,
    ): CompiledInstruction {
        val keys = ZrpLaunchpad.deriveZrpLaunchKeys(mint, programId)
        val curveTokenVault = findAssociatedTokenAddress(mint, keys.bondingCurve)
        val sellerTokenAccount = findAssociatedTokenAddress(mint, owner)
        val data = ZrpLaunchpad.encodeSellIx(tokenAmountRaw, minSolOut)

        return CompiledInstruction(
            programId = programId,
            accounts = listOf(
                AccountMeta(keys.globalConfig, isSigner = false, isWritable = false),
                AccountMeta(keys.bondingCurve, isSigner = false, isWritable = true),
                AccountMeta(mint, isSigner = false, isWritable = false),
                AccountMeta(curveTokenVault, isSigner = false, isWritable = true),
                AccountMeta(sellerTokenAccount, isSigner = false, isWritable = true),
                AccountMeta(owner, isSigner = true, isWritable = true),
                AccountMeta(feeRecipient, isSigner = false, isWritable = true),
                AccountMeta(TOKEN_PROGRAM_ID, isSigner = false, isWritable = false),
            ),
            data = data,
        )
    }

    fun compile(
        feePayer: SolanaPublicKey,
        instruction: CompiledInstruction,
        recentBlockhashBytes: ByteArray,
    ): ByteArray = SolanaTransactionCompiler.compileUnsignedTransaction(feePayer, listOf(instruction), recentBlockhashBytes)
}
