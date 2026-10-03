package one.zrp.social.mobile.solana

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Every expected value below was computed by this repo's own real,
 * already-proven-correct @solana/web3.js (node_modules/@solana/web3.js),
 * via `PublicKey.isOnCurve()`/`findProgramAddressSync()` run directly in
 * this sandbox - not guessed, not derived from this same Kotlin code. If
 * Ed25519Curve.isOnCurve disagrees with any of these, the Kotlin port has
 * a real bug, not a test-authoring one.
 */
class Ed25519CurveTest {

    @Test
    fun `regular keypair addresses are on curve`() {
        // Real ed25519 keypair public keys (program identity / random
        // Keypair.generate() outputs) must be on-curve - that is what
        // makes them valid as actual signing keys in the first place.
        assertEquals(true, Ed25519Curve.isOnCurve(Base58.decode("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK")))
        assertEquals(true, Ed25519Curve.isOnCurve(Base58.decode("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")))
        assertEquals(true, Ed25519Curve.isOnCurve(Base58.decode("9V5zbyUVuzBcBCzr5kR8mxyzmV2h6GnsMSB3EYLMf5UF")))
        assertEquals(true, Ed25519Curve.isOnCurve(Base58.decode("49gZSKuxCDuWZDRTCwFuza7sXr5owExHVFBxNmeV5V9B")))
        assertEquals(true, Ed25519Curve.isOnCurve(Base58.decode("2BLM64JYF15PujpD1zN6sZgxPNttWMcxA8SgXkAfr2wt")))
    }

    @Test
    fun `real ZRP PDAs are off curve`() {
        // Ground truth: PublicKey.findProgramAddressSync([Buffer.from("global")], programId)
        // against the real devnet-deployed ZRP Launchpad program ID.
        assertEquals(false, Ed25519Curve.isOnCurve(Base58.decode("9c7PdQJ4ZYyMivTog68uAo7LWNcuNKghzyi8AfRqAQy3")))
        // findProgramAddressSync([Buffer.from("bonding-curve"), USDC_MINT.toBuffer()], programId)
        assertEquals(false, Ed25519Curve.isOnCurve(Base58.decode("8UB5dEutCq9wjjE9BzmCB6pFmKoDTBqi7q8jLNDeAUrj")))
        // findProgramAddressSync([Buffer.from("metadata"), METAPLEX_PROGRAM.toBuffer(), USDC_MINT.toBuffer()], METAPLEX_PROGRAM)
        assertEquals(false, Ed25519Curve.isOnCurve(Base58.decode("5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq")))
    }

    @Test
    fun `edge cases match the real library exactly`() {
        assertEquals(true, Ed25519Curve.isOnCurve(ByteArray(32))) // all-zero: a real, documented on-curve special case
        assertEquals(false, Ed25519Curve.isOnCurve(ByteArray(32) { 0xFF.toByte() })) // all-0xFF: off curve
    }

    @Test
    fun `rejects a non-32-byte input`() {
        var threw = false
        try {
            Ed25519Curve.isOnCurve(ByteArray(31))
        } catch (_: IllegalArgumentException) {
            threw = true
        }
        assertEquals(true, threw)
    }
}
