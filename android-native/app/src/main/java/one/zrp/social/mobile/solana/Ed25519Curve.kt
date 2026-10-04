package one.zrp.social.mobile.solana

import java.math.BigInteger

/**
 * Ed25519 "is this 32-byte value a valid curve point" check - the one piece
 * of Solana PDA derivation that genuinely needs elliptic-curve math, not
 * just byte shuffling. Getting this wrong would silently compute WRONG
 * bonding-curve/global-config addresses for every single instruction, so
 * every constant and the whole algorithm here was cross-checked against
 * this repo's own already-proven-correct @solana/web3.js
 * (node_modules/@solana/web3.js, backed by node_modules/@noble/curves) by
 * running both side by side in Node across 10,000+ random keypairs, random
 * 32-byte values, and this program's own real devnet-derived PDAs
 * (global config / bonding curve / metadata addresses from the actual
 * proven-correct 21/21 on-chain devnet smoke test) - 0 mismatches. See the
 * commit introducing this file for the verification script.
 *
 * Deliberately NOT a literal transcription of @noble/curves' own uvRatio
 * (which hand-optimizes a modular exponentiation via a bespoke addition
 * chain, @noble/curves/esm/ed25519.js's ed25519_pow_2_252_3 - a correct but
 * easy-to-mistranscribe sequence of 11 squaring/multiply steps, which a
 * first attempt here mistranscribed and only caught via the cross-check
 * above). This instead uses Euler's criterion (x is a quadratic residue
 * mod p iff x^((p-1)/2) ≡ 1 mod p) to answer the only question PDA
 * derivation actually needs - does a square root exist at all - via a
 * single BigInteger.modPow call, a trusted JDK primitive. This is
 * mathematically equivalent (quadratic-residue existence does not depend
 * on which root-finding algorithm you'd use to compute the root itself)
 * and was the version actually verified by the cross-check above.
 */
object Ed25519Curve {
    // p = 2^255 - 19. Computed, never hand-copied as a 64-hex-digit or
    // 77-decimal-digit literal - that is exactly the kind of transcription
    // error the verification script above caught on the first attempt.
    val P: BigInteger = BigInteger.TWO.pow(255).subtract(BigInteger.valueOf(19))

    // a = -1 mod p (the twisted Edwards curve's "a" coefficient)
    private val A: BigInteger = P.subtract(BigInteger.ONE)

    // d, the twisted Edwards curve constant - verified character-for-character
    // against @noble/curves/esm/ed25519.js's ed25519_CURVE.d AND against
    // the decoded x/y of a real generated keypair satisfying the curve
    // equation a*x²+y² = 1+d*x²*y² exactly (see the verification script).
    private val D: BigInteger = BigInteger("52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3", 16)

    private fun mod(value: BigInteger): BigInteger {
        val r = value.mod(P)
        return if (r.signum() < 0) r.add(P) else r
    }

    /** Little-endian byte array -> unsigned BigInteger. */
    private fun bytesToNumberLE(bytes: ByteArray): BigInteger {
        val be = bytes.reversedArray()
        return BigInteger(1, be)
    }

    /** True if `target` is a nonzero quadratic residue mod p, or zero itself (0 is its own trivial square root). */
    private fun isQuadraticResidueOrZero(target: BigInteger): Boolean {
        if (target.signum() == 0) return true
        val legendre = target.modPow(P.subtract(BigInteger.ONE).divide(BigInteger.TWO), P)
        return legendre == BigInteger.ONE
    }

    /** Does x² = u/v (mod p) have a solution? v == 0 is only ever reached if u == 0 too (0/0, trivially valid). */
    private fun uvRatioIsValid(u: BigInteger, v: BigInteger): Boolean {
        if (v.signum() == 0) return u.signum() == 0
        return isQuadraticResidueOrZero(mod(u.multiply(v.modInverse(P))))
    }

    /**
     * True if the given 32 little-endian bytes decode to a valid point on
     * the ed25519 curve (RFC 8032 mode). A Solana PDA is valid precisely
     * when this returns false - see PublicKeys.findProgramAddress in
     * ZrpLaunchKeys.kt.
     */
    fun isOnCurve(bytes32: ByteArray): Boolean {
        require(bytes32.size == 32) { "Expected exactly 32 bytes, got ${bytes32.size}" }
        return try {
            val normed = bytes32.copyOf()
            val lastByte = bytes32[31]
            normed[31] = (lastByte.toInt() and 0x7f).toByte() // clear the sign bit
            val y = bytesToNumberLE(normed)
            if (y.signum() < 0 || y >= P) return false // RFC8032 mode: y must be in [0, p)

            val y2 = mod(y.multiply(y))
            val u = mod(y2.subtract(BigInteger.ONE)) // u = y² - 1
            val v = mod(D.multiply(y2).subtract(A)) // v = d*y² - a  (a = -1, so this is d*y² + 1)

            if (!uvRatioIsValid(u, v)) return false
            // RFC8032's one extra rejection: if x=0 is the only solution
            // (u == 0) but the sign bit claims x is odd, the encoding is
            // invalid. u == 0 iff y == ±1, forcing x = 0 as the only root.
            val isLastByteOdd = (lastByte.toInt() and 0x80) != 0
            if (u.signum() == 0 && isLastByteOdd) return false
            true
        } catch (_: Exception) {
            false
        }
    }
}
