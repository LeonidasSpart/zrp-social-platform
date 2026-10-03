package one.zrp.social.mobile.solana

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Ground truth computed by this repo's own real @solana/web3.js
 * (PublicKey.findProgramAddressSync), run directly in this sandbox against
 * the real devnet-deployed ZRP Launchpad program ID - not guessed.
 */
class SolanaPublicKeyTest {
    private val programId = SolanaPublicKey("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK")
    private val metadataProgram = SolanaPublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    private val usdcMint = SolanaPublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")

    @Test
    fun `global config PDA matches real web3js output`() {
        // findProgramAddressSync([Buffer.from("global")], programId)
        val (address, bump) = SolanaPublicKey.findProgramAddress(
            listOf("global".toByteArray(Charsets.US_ASCII)),
            programId
        )
        assertEquals("9c7PdQJ4ZYyMivTog68uAo7LWNcuNKghzyi8AfRqAQy3", address.toBase58())
        assertEquals(254, bump)
    }

    @Test
    fun `bonding curve PDA matches real web3js output`() {
        // findProgramAddressSync([Buffer.from("bonding-curve"), USDC_MINT.toBuffer()], programId)
        val (address, bump) = SolanaPublicKey.findProgramAddress(
            listOf("bonding-curve".toByteArray(Charsets.US_ASCII), usdcMint.bytes),
            programId
        )
        assertEquals("8UB5dEutCq9wjjE9BzmCB6pFmKoDTBqi7q8jLNDeAUrj", address.toBase58())
        assertEquals(255, bump)
    }

    @Test
    fun `metadata PDA matches real web3js output`() {
        // findProgramAddressSync([Buffer.from("metadata"), METAPLEX_PROGRAM.toBuffer(), USDC_MINT.toBuffer()], METAPLEX_PROGRAM)
        val (address, bump) = SolanaPublicKey.findProgramAddress(
            listOf("metadata".toByteArray(Charsets.US_ASCII), metadataProgram.bytes, usdcMint.bytes),
            metadataProgram
        )
        assertEquals("5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq", address.toBase58())
        assertEquals(255, bump)
    }

    @Test
    fun `base58 round-trips through SolanaPublicKey`() {
        val addr = "3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK"
        assertEquals(addr, SolanaPublicKey(addr).toBase58())
    }
}
