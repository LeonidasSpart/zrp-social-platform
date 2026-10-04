package one.zrp.social.mobile.solana

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The all-zero case here is a real regression test: decode("1" * 32) - the
 * Solana System Program ID - previously returned 33 bytes instead of 32
 * (BigInteger.ZERO.toByteArray() produces a spurious single zero byte that
 * wasn't excluded from the leading-zero count), which tripped
 * SolanaPublicKey's 32-byte assertion and failed Android CI with
 * IllegalArgumentException on every test that referenced the System
 * Program or a similar all/mostly-zero address.
 */
class Base58Test {
    @Test
    fun `decode of the all-ones System Program ID is exactly 32 zero bytes`() {
        val decoded = Base58.decode("11111111111111111111111111111111")
        assertEquals(32, decoded.size)
        assertArrayEquals(ByteArray(32), decoded)
    }

    @Test
    fun `encode of 32 zero bytes round-trips through decode`() {
        val zero = ByteArray(32)
        val encoded = Base58.encode(zero)
        assertEquals("11111111111111111111111111111111", encoded)
        assertArrayEquals(zero, Base58.decode(encoded))
    }

    @Test
    fun `round-trips a real non-zero 32-byte address`() {
        val original = Base58.decode("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R")
        assertEquals(32, original.size)
        assertEquals("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", Base58.encode(original))
    }

    @Test
    fun `round-trips an address with a single leading zero byte`() {
        // Starts with one zero byte (one leading '1') followed by non-zero bytes -
        // the mixed case the pre-fix code already handled correctly.
        val original = Base58.decode("SysvarRent111111111111111111111111111111111")
        assertEquals(32, original.size)
        assertEquals("SysvarRent111111111111111111111111111111111", Base58.encode(original))
    }

    @Test
    fun `rejects an invalid base58 character`() {
        try {
            Base58.decode("0OIl")
            throw AssertionError("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            // expected - '0', 'O', 'I', 'l' are all excluded from the Base58 alphabet.
        }
    }
}
