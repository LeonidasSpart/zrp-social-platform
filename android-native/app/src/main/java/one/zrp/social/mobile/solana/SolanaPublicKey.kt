package one.zrp.social.mobile.solana

import java.math.BigInteger
import java.security.MessageDigest

/**
 * A bare 32-byte Solana address. Intentionally minimal - no signing, no
 * keypair generation, nothing this app should ever need since it never
 * holds a private key (see ZRP_LAUNCH_README at the top of ZrpLaunchKeys.kt
 * for the non-custodial architecture this supports).
 */
class SolanaPublicKey(val bytes: ByteArray) {
    init {
        require(bytes.size == 32) { "A Solana public key is exactly 32 bytes, got ${bytes.size}" }
    }

    constructor(base58: String) : this(Base58.decode(base58).also {
        require(it.size == 32) { "Invalid base58-encoded public key: $base58" }
    })

    fun toBase58(): String = Base58.encode(bytes)

    override fun equals(other: Any?): Boolean = other is SolanaPublicKey && bytes.contentEquals(other.bytes)
    override fun hashCode(): Int = bytes.contentHashCode()
    override fun toString(): String = toBase58()

    companion object {
        /**
         * Mirrors @solana/web3.js's PublicKey.createProgramAddressSync
         * exactly: concat(seeds) + programId + "ProgramDerivedAddress",
         * SHA-256, and the result must be OFF the ed25519 curve.
         */
        fun createProgramAddress(seeds: List<ByteArray>, programId: SolanaPublicKey): SolanaPublicKey {
            for (seed in seeds) {
                require(seed.size <= 32) { "Max seed length exceeded (32 bytes)" }
            }
            val digest = MessageDigest.getInstance("SHA-256")
            for (seed in seeds) digest.update(seed)
            digest.update(programId.bytes)
            digest.update(PDA_MARKER)
            val hash = digest.digest()
            require(!Ed25519Curve.isOnCurve(hash)) { "Invalid seeds, address must fall off the curve" }
            return SolanaPublicKey(hash)
        }

        /**
         * Mirrors PublicKey.findProgramAddressSync exactly: starts the
         * bump at 255 and walks down until createProgramAddress succeeds
         * (i.e. the hash lands off-curve). Returns (address, bump).
         */
        fun findProgramAddress(seeds: List<ByteArray>, programId: SolanaPublicKey): Pair<SolanaPublicKey, Int> {
            var bump = 255
            while (bump != 0) {
                try {
                    val address = createProgramAddress(seeds + byteArrayOf(bump.toByte()), programId)
                    return address to bump
                } catch (_: IllegalArgumentException) {
                    bump--
                }
            }
            throw IllegalStateException("Unable to find a viable program address bump seed")
        }

        private val PDA_MARKER = "ProgramDerivedAddress".toByteArray(Charsets.US_ASCII)
    }
}

/** Little-endian unsigned 64-bit write/read helpers shared by instruction encoding and account decoding below. */
internal fun ByteArray.readU64LE(offset: Int): BigInteger {
    var result = BigInteger.ZERO
    for (i in 7 downTo 0) {
        result = result.shiftLeft(8).or(BigInteger.valueOf((this[offset + i].toInt() and 0xFF).toLong()))
    }
    return result
}

internal fun u64LEBytes(value: BigInteger): ByteArray {
    require(value.signum() >= 0) { "u64 value must be non-negative, got $value" }
    val out = ByteArray(8)
    var v = value
    val base = BigInteger.valueOf(256)
    for (i in 0 until 8) {
        out[i] = v.mod(base).toInt().toByte()
        v = v.shiftRight(8)
    }
    return out
}
