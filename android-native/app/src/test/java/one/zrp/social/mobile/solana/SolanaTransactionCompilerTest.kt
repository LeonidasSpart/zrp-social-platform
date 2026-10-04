package one.zrp.social.mobile.solana

import one.zrp.social.mobile.solana.SolanaTransactionCompiler.AccountMeta
import one.zrp.social.mobile.solana.SolanaTransactionCompiler.CompiledInstruction
import org.junit.Assert.assertEquals
import org.junit.Test
import java.math.BigInteger

/**
 * This compiler's underlying ALGORITHM (dedupe + 4-category partition,
 * fee-payer-first) was separately verified as genuinely protocol-correct
 * by round-tripping its JS equivalent through the real
 * @solana/web3.js Transaction.from() deserializer for both a
 * single-signer and a two-signer transaction, confirming every field
 * (fee payer, blockhash, program ID, instruction data, every account's
 * pubkey/isSigner/isWritable) decodes back out exactly as given - see
 * this class's own KDoc and the commit introducing this file.
 *
 * The exact byte vectors below are that same verified JS implementation's
 * output for the identical inputs - this test confirms the Kotlin
 * transcription of the algorithm matches it exactly, not that the
 * algorithm itself is correct (that was already established separately).
 */
class SolanaTransactionCompilerTest {
    private val blockhashBytes = Base58.decode("EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTvK3eWG6")

    @Test
    fun `single-signer buy transaction matches the verified reference byte-for-byte`() {
        val programId = SolanaPublicKey("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK")
        val globalConfig = SolanaPublicKey("9c7PdQJ4ZYyMivTog68uAo7LWNcuNKghzyi8AfRqAQy3")
        val bondingCurve = SolanaPublicKey("8UB5dEutCq9wjjE9BzmCB6pFmKoDTBqi7q8jLNDeAUrj")
        val mint = SolanaPublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
        val curveTokenVault = SolanaPublicKey("CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq")
        val buyerTokenAccount = SolanaPublicKey("DustyBC9Ni6yKnFxNZcTvsR8L3qm3UKjtN6o7vYnJfjy")
        val buyer = SolanaPublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R")
        val feeRecipient = SolanaPublicKey("DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ")
        val tokenProgram = SolanaPublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        val associatedTokenProgram = SolanaPublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        val systemProgram = SolanaPublicKey("11111111111111111111111111111111")

        val data = ZrpLaunchpad.encodeBuyIx(BigInteger.valueOf(1_500_000_000), BigInteger.valueOf(999_999))
        val ix = CompiledInstruction(
            programId = programId,
            accounts = listOf(
                AccountMeta(globalConfig, isSigner = false, isWritable = false),
                AccountMeta(bondingCurve, isSigner = false, isWritable = true),
                AccountMeta(mint, isSigner = false, isWritable = false),
                AccountMeta(curveTokenVault, isSigner = false, isWritable = true),
                AccountMeta(buyerTokenAccount, isSigner = false, isWritable = true),
                AccountMeta(buyer, isSigner = true, isWritable = true),
                AccountMeta(feeRecipient, isSigner = false, isWritable = true),
                AccountMeta(tokenProgram, isSigner = false, isWritable = false),
                AccountMeta(associatedTokenProgram, isSigner = false, isWritable = false),
                AccountMeta(systemProgram, isSigner = false, isWritable = false),
            ),
            data = data,
        )

        val result = SolanaTransactionCompiler.compileUnsignedTransaction(buyer, listOf(ix), blockhashBytes)
        val expected = "01000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100060b37998ccbf2d0458b615cbcc6b1a367c4749e9fef7306622e1b1b58910120bc9a6ef7e334e758926f7adc0a9c01b0c92812c60e3fbb75658adf1311bba4000b08b0f1d91026713c55f826f58f9ea778b4b8967efefc5aaebd8d09b33a0d228dbebfd7fe55534a1c61b053e8d3234f9f188768513ed06c380f132c39b75804ca2cb953b5f8dd5457a2a0f0d41903409785b9d84d4045614faa4f505ee132dcd7697fdc0c900af09d0f9775332efa96b9bd5bf7c59f3f55e743a0813c095e93c556c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d6106ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a98c97258f4e2489f1bb3d1029148e0d830b5a1399daff1084048e7bd8dbe9f85900000000000000000000000000000000000000000000000000000000000000002b8291d878493384106b2a96eea305be9b763ad84afe583d28127454ed5126f8c49ae77603782054f17a9decea43b444eba0edb12c6f1d31c6e0e4d119735be7010a0a050106020300040708091866063d1201daebea002f6859000000003f420f0000000000"
        assertEquals(expected, result.joinToString("") { "%02x".format(it) })
    }

    @Test
    fun `two-signer create_and_buy transaction matches the verified reference byte-for-byte`() {
        val programId = SolanaPublicKey("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK")
        val globalConfig = SolanaPublicKey("9c7PdQJ4ZYyMivTog68uAo7LWNcuNKghzyi8AfRqAQy3")
        val bondingCurve = SolanaPublicKey("8UB5dEutCq9wjjE9BzmCB6pFmKoDTBqi7q8jLNDeAUrj")
        val mintKeypairPub = SolanaPublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
        val curveTokenVault = SolanaPublicKey("CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq")
        val creatorTokenAccount = SolanaPublicKey("DustyBC9Ni6yKnFxNZcTvsR8L3qm3UKjtN6o7vYnJfjy")
        val metadata = SolanaPublicKey("5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq")
        val owner = SolanaPublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R")
        val feeRecipient = SolanaPublicKey("DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ")
        val tokenMetadataProgram = SolanaPublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
        val tokenProgram = SolanaPublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        val associatedTokenProgram = SolanaPublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        val systemProgram = SolanaPublicKey("11111111111111111111111111111111")
        val rentSysvar = SolanaPublicKey("SysvarRent111111111111111111111111111111111")

        val data = ZrpLaunchpad.encodeCreateAndBuyIx(
            name = "Test", symbol = "TST", uri = "https://x.test/m.json",
            initialBuyLamports = BigInteger.valueOf(2_000_000_000), minTokensOut = BigInteger.ONE,
        )
        val ix = CompiledInstruction(
            programId = programId,
            accounts = listOf(
                AccountMeta(globalConfig, isSigner = false, isWritable = false),
                AccountMeta(bondingCurve, isSigner = false, isWritable = true),
                AccountMeta(mintKeypairPub, isSigner = true, isWritable = true),
                AccountMeta(curveTokenVault, isSigner = false, isWritable = true),
                AccountMeta(creatorTokenAccount, isSigner = false, isWritable = true),
                AccountMeta(metadata, isSigner = false, isWritable = true),
                AccountMeta(owner, isSigner = true, isWritable = true),
                AccountMeta(feeRecipient, isSigner = false, isWritable = true),
                AccountMeta(tokenMetadataProgram, isSigner = false, isWritable = false),
                AccountMeta(tokenProgram, isSigner = false, isWritable = false),
                AccountMeta(associatedTokenProgram, isSigner = false, isWritable = false),
                AccountMeta(systemProgram, isSigner = false, isWritable = false),
                AccountMeta(rentSysvar, isSigner = false, isWritable = false),
            ),
            data = data,
        )

        val result = SolanaTransactionCompiler.compileUnsignedTransaction(owner, listOf(ix), blockhashBytes)
        val expected = "0200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200070e37998ccbf2d0458b615cbcc6b1a367c4749e9fef7306622e1b1b58910120bc9ac6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d616ef7e334e758926f7adc0a9c01b0c92812c60e3fbb75658adf1311bba4000b08b0f1d91026713c55f826f58f9ea778b4b8967efefc5aaebd8d09b33a0d228dbebfd7fe55534a1c61b053e8d3234f9f188768513ed06c380f132c39b75804ca2c498818ad986972f77c11ba8787819367d62e8924f6db6b6bd37dc74c2fd9613ab953b5f8dd5457a2a0f0d41903409785b9d84d4045614faa4f505ee132dcd7697fdc0c900af09d0f9775332efa96b9bd5bf7c59f3f55e743a0813c095e93c5560b7065b1e3d17c45389d527f6b04c3cd58b86c731aa0fdb549b6d1bc03f8294606ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a98c97258f4e2489f1bb3d1029148e0d830b5a1399daff1084048e7bd8dbe9f859000000000000000000000000000000000000000000000000000000000000000006a7d517192c5c51218cc94c3d4af17f58daee089ba1fd44e3dbd98a000000002b8291d878493384106b2a96eea305be9b763ad84afe583d28127454ed5126f8c49ae77603782054f17a9decea43b444eba0edb12c6f1d31c6e0e4d119735be7010d0d070201030405000608090a0b0c4045a6cc9138421c790400000054657374030000005453541500000068747470733a2f2f782e746573742f6d2e6a736f6e00943577000000000100000000000000"
        assertEquals(expected, result.joinToString("") { "%02x".format(it) })
    }

    @Test
    fun `compact-u16 encoding handles values requiring multiple bytes`() {
        // A fee payer plus 200 unique writable accounts plus the
        // instruction's own program ID (added as its own account entry
        // by compileUnsignedTransaction, since instructions reference
        // their program by index too) is 202 total, forcing the
        // account-count compact-u16 above 127, needing 2 bytes:
        // 202 = 0b1100_1010 -> low 7 bits 0x4a with continuation bit set
        // (0xCA), remaining value 1 as the final byte (0x01).
        val programId = SolanaPublicKey("11111111111111111111111111111111")
        val feePayer = SolanaPublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R")
        val accounts = (1..200).map {
            val seed = ByteArray(32).also { b -> b[0] = (it and 0xFF).toByte(); b[1] = ((it shr 8) and 0xFF).toByte() }
            AccountMeta(SolanaPublicKey(seed), isSigner = false, isWritable = true)
        }
        val ix = CompiledInstruction(programId, accounts, ByteArray(0))
        val result = SolanaTransactionCompiler.compileUnsignedTransaction(feePayer, listOf(ix), blockhashBytes)
        // 1 (sig count, 1 byte) + 64 (sig) + 3 (header) + account-count-compact-u16 + 202*32 (keys) + 32 (blockhash) + instructions...
        // Just assert it doesn't throw and the account-count varint is 2 bytes (0xca, 0x01 for 202 accounts: feePayer + 200 + programId).
        val accountCountOffset = 1 + 64 + 3
        assertEquals(0xca, result[accountCountOffset].toInt() and 0xFF)
        assertEquals(0x01, result[accountCountOffset + 1].toInt() and 0xFF)
    }
}
