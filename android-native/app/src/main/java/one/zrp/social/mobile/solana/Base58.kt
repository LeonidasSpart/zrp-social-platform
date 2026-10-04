package one.zrp.social.mobile.solana

import java.math.BigInteger

/**
 * Bitcoin/Solana-alphabet Base58 - used everywhere a Solana address or
 * signature needs to go from/to its human-readable string form. Pure,
 * dependency-free, directly testable: no Android API surface at all.
 */
object Base58 {
    private const val ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    private val ALPHABET_INDEX = IntArray(128) { -1 }.also { map ->
        ALPHABET.forEachIndexed { index, c -> map[c.code] = index }
    }
    private val BASE = BigInteger.valueOf(58)

    fun encode(input: ByteArray): String {
        if (input.isEmpty()) return ""
        var value = BigInteger(1, input)
        val sb = StringBuilder()
        while (value > BigInteger.ZERO) {
            val (div, rem) = value.divideAndRemainder(BASE)
            sb.append(ALPHABET[rem.toInt()])
            value = div
        }
        // Preserve leading zero bytes as leading '1's, matching Bitcoin/Solana convention.
        for (b in input) {
            if (b.toInt() == 0) sb.append(ALPHABET[0]) else break
        }
        return sb.reverse().toString()
    }

    fun decode(input: String): ByteArray {
        if (input.isEmpty()) return ByteArray(0)
        var value = BigInteger.ZERO
        for (c in input) {
            val digit = if (c.code < 128) ALPHABET_INDEX[c.code] else -1
            require(digit >= 0) { "Invalid Base58 character: $c" }
            value = value.multiply(BASE).add(BigInteger.valueOf(digit.toLong()))
        }
        // BigInteger.ZERO.toByteArray() returns a single 0x00 byte, not
        // an empty array - for an all-'1' input (decoded value exactly
        // zero, e.g. the System Program address) that byte would double
        // count against the leading-zero padding added below, producing
        // one byte too many. Every leading zero byte is already captured
        // by leadingZeros, so the magnitude itself is empty here.
        var bytes = if (value.signum() == 0) ByteArray(0) else value.toByteArray()
        // BigInteger.toByteArray() may prepend a sign byte (0x00) for a
        // value whose high bit would otherwise be read as negative -
        // strip it, it is not part of the encoded data.
        if (bytes.size > 1 && bytes[0].toInt() == 0) {
            bytes = bytes.copyOfRange(1, bytes.size)
        }
        var leadingZeros = 0
        for (c in input) {
            if (c == ALPHABET[0]) leadingZeros++ else break
        }
        return ByteArray(leadingZeros) + bytes
    }
}
