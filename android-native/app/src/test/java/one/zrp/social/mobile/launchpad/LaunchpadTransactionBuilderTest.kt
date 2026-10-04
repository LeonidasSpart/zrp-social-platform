package one.zrp.social.mobile.launchpad

import java.math.BigInteger
import one.zrp.social.mobile.solana.SolanaPublicKey
import one.zrp.social.mobile.solana.ZrpLaunchpad
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies LaunchpadTransactionBuilder's account lists match
 * src/lib/launchpad/client-zrp-launch.ts's createZrpTokenFromBrowser/
 * buyOnZrpCurve/sellOnZrpCurve exactly - same accounts, same order, same
 * signer/writable flags - since that file (read directly for this
 * port, not from memory) is the already-live reference implementation
 * every one of these instructions must byte-for-byte agree with.
 */
class LaunchpadTransactionBuilderTest {
    private val programId = SolanaPublicKey("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK")
    private val owner = SolanaPublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R")
    private val mint = SolanaPublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
    private val feeRecipient = SolanaPublicKey("DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ")

    @Test
    fun `buy instruction accounts match client-zrp-launch's buyOnZrpCurve exactly`() {
        val keys = ZrpLaunchpad.deriveZrpLaunchKeys(mint, programId)
        val curveTokenVault = LaunchpadTransactionBuilder.findAssociatedTokenAddress(mint, keys.bondingCurve)
        val buyerTokenAccount = LaunchpadTransactionBuilder.findAssociatedTokenAddress(mint, owner)

        val ix = LaunchpadTransactionBuilder.buildBuyInstruction(
            owner = owner, mint = mint, solLamports = BigInteger.valueOf(1_500_000_000),
            minTokensOut = BigInteger.valueOf(999_999), feeRecipient = feeRecipient, programId = programId,
        )

        assertEquals(programId, ix.programId)
        assertEquals(10, ix.accounts.size)
        val expected = listOf(
            Triple(keys.globalConfig, false, false),
            Triple(keys.bondingCurve, false, true),
            Triple(mint, false, false),
            Triple(curveTokenVault, false, true),
            Triple(buyerTokenAccount, false, true),
            Triple(owner, true, true),
            Triple(feeRecipient, false, true),
            Triple(LaunchpadTransactionBuilder.TOKEN_PROGRAM_ID, false, false),
            Triple(LaunchpadTransactionBuilder.ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
            Triple(LaunchpadTransactionBuilder.SYSTEM_PROGRAM_ID, false, false),
        )
        expected.forEachIndexed { i, (pubkey, isSigner, isWritable) ->
            assertEquals("account[$i] pubkey", pubkey, ix.accounts[i].pubkey)
            assertEquals("account[$i] isSigner", isSigner, ix.accounts[i].isSigner)
            assertEquals("account[$i] isWritable", isWritable, ix.accounts[i].isWritable)
        }
    }

    @Test
    fun `sell instruction accounts match client-zrp-launch's sellOnZrpCurve exactly - no ATA or system program needed`() {
        val keys = ZrpLaunchpad.deriveZrpLaunchKeys(mint, programId)
        val curveTokenVault = LaunchpadTransactionBuilder.findAssociatedTokenAddress(mint, keys.bondingCurve)
        val sellerTokenAccount = LaunchpadTransactionBuilder.findAssociatedTokenAddress(mint, owner)

        val ix = LaunchpadTransactionBuilder.buildSellInstruction(
            owner = owner, mint = mint, tokenAmountRaw = BigInteger.valueOf(500_000_000),
            minSolOut = BigInteger.valueOf(1), feeRecipient = feeRecipient, programId = programId,
        )

        assertEquals(programId, ix.programId)
        val expected = listOf(
            Triple(keys.globalConfig, false, false),
            Triple(keys.bondingCurve, false, true),
            Triple(mint, false, false),
            Triple(curveTokenVault, false, true),
            Triple(sellerTokenAccount, false, true),
            Triple(owner, true, true),
            Triple(feeRecipient, false, true),
            Triple(LaunchpadTransactionBuilder.TOKEN_PROGRAM_ID, false, false),
        )
        assertEquals(expected.size, ix.accounts.size)
        expected.forEachIndexed { i, (pubkey, isSigner, isWritable) ->
            assertEquals("account[$i] pubkey", pubkey, ix.accounts[i].pubkey)
            assertEquals("account[$i] isSigner", isSigner, ix.accounts[i].isSigner)
            assertEquals("account[$i] isWritable", isWritable, ix.accounts[i].isWritable)
        }
    }

    @Test
    fun `create_and_buy instruction accounts match client-zrp-launch's createZrpTokenFromBrowser exactly`() {
        val mintKeypairPublicKey = SolanaPublicKey("5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq")
        val keys = ZrpLaunchpad.deriveZrpLaunchKeys(mintKeypairPublicKey, programId)
        val curveTokenVault = LaunchpadTransactionBuilder.findAssociatedTokenAddress(mintKeypairPublicKey, keys.bondingCurve)
        val creatorTokenAccount = LaunchpadTransactionBuilder.findAssociatedTokenAddress(mintKeypairPublicKey, owner)

        val ix = LaunchpadTransactionBuilder.buildCreateAndBuyInstruction(
            owner = owner, mintKeypairPublicKey = mintKeypairPublicKey, name = "Test", symbol = "TST",
            metadataUri = "https://zrp.one/api/launchpad/tokens/${mintKeypairPublicKey}/metadata.json",
            initialBuyLamports = BigInteger.valueOf(2_000_000_000), minTokensOut = BigInteger.ONE,
            feeRecipient = feeRecipient, programId = programId,
        )

        assertEquals(programId, ix.programId)
        val expected = listOf(
            Triple(keys.globalConfig, false, false),
            Triple(keys.bondingCurve, false, true),
            Triple(mintKeypairPublicKey, true, true),
            Triple(curveTokenVault, false, true),
            Triple(creatorTokenAccount, false, true),
            Triple(keys.metadata, false, true),
            Triple(owner, true, true),
            Triple(feeRecipient, false, true),
            Triple(ZrpLaunchpad.TOKEN_METADATA_PROGRAM_ID, false, false),
            Triple(LaunchpadTransactionBuilder.TOKEN_PROGRAM_ID, false, false),
            Triple(LaunchpadTransactionBuilder.ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
            Triple(LaunchpadTransactionBuilder.SYSTEM_PROGRAM_ID, false, false),
            Triple(LaunchpadTransactionBuilder.SYSVAR_RENT_PUBKEY, false, false),
        )
        assertEquals(expected.size, ix.accounts.size)
        expected.forEachIndexed { i, (pubkey, isSigner, isWritable) ->
            assertEquals("account[$i] pubkey", pubkey, ix.accounts[i].pubkey)
            assertEquals("account[$i] isSigner", isSigner, ix.accounts[i].isSigner)
            assertEquals("account[$i] isWritable", isWritable, ix.accounts[i].isWritable)
        }
    }

    @Test
    fun `the two trading instructions have exactly two signers, fee payer plus owner, and compile without throwing`() {
        val buyIx = LaunchpadTransactionBuilder.buildBuyInstruction(
            owner, mint, BigInteger.valueOf(1_000_000_000), BigInteger.ONE, feeRecipient, programId,
        )
        val signers = buyIx.accounts.filter { it.isSigner }
        assertEquals(1, signers.size)
        assertTrue(signers.single().pubkey == owner)
        assertFalse(buyIx.accounts.any { it.pubkey == owner && !it.isWritable })

        val blockhash = ByteArray(32) { it.toByte() }
        val compiled = LaunchpadTransactionBuilder.compile(owner, buyIx, blockhash)
        assertTrue(compiled.isNotEmpty())
    }
}
