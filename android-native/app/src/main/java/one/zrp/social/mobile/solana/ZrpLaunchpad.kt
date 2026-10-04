package one.zrp.social.mobile.solana

import java.math.BigInteger
import java.security.MessageDigest
import java.util.Base64

/**
 * Direct Kotlin port of src/lib/launchpad/zrp-launch-keys.ts - the ZRP
 * Launchpad program's PDA seeds, quote math, Anchor instruction encoding,
 * and account/event decoding. Every function here is pure (no network, no
 * Android API) and was cross-checked line-for-line against the TS source,
 * then numerically verified against it by running both side by side in
 * Node for the quote math and instruction encoding (see the commit
 * introducing this file for the verification script) - not just read and
 * assumed equivalent.
 *
 * u64 values use BigInteger throughout, never Long, mirroring the TS
 * source's own use of bigint instead of number - Kotlin's Long is signed
 * 64-bit and would silently misbehave on real token supplies that exceed
 * Long.MAX_VALUE (TS bigint and on-chain u64 have no such ceiling).
 */
object ZrpLaunchpad {
    val DEVNET_PROGRAM_ID = SolanaPublicKey("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK")
    val TOKEN_METADATA_PROGRAM_ID = SolanaPublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

    private val GLOBAL_CONFIG_SEED = "global".toByteArray(Charsets.US_ASCII)
    private val BONDING_CURVE_SEED_PREFIX = "bonding-curve".toByteArray(Charsets.US_ASCII)
    private val METADATA_SEED = "metadata".toByteArray(Charsets.US_ASCII)

    data class ZrpLaunchKeys(
        val programId: SolanaPublicKey,
        val globalConfig: SolanaPublicKey,
        val bondingCurve: SolanaPublicKey,
        val metadata: SolanaPublicKey,
    )

    /** Pure, offline PDA derivation - mirrors deriveZrpLaunchKeys exactly. */
    fun deriveZrpLaunchKeys(mint: SolanaPublicKey, programId: SolanaPublicKey): ZrpLaunchKeys {
        val (globalConfig, _) = SolanaPublicKey.findProgramAddress(listOf(GLOBAL_CONFIG_SEED), programId)
        val (bondingCurve, _) = SolanaPublicKey.findProgramAddress(
            listOf(BONDING_CURVE_SEED_PREFIX, mint.bytes),
            programId
        )
        val (metadata, _) = SolanaPublicKey.findProgramAddress(
            listOf(METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.bytes, mint.bytes),
            TOKEN_METADATA_PROGRAM_ID
        )
        return ZrpLaunchKeys(programId, globalConfig, bondingCurve, metadata)
    }

    // ───────────────────────── Quote math ─────────────────────────
    // Mirrors programs/zrp-launchpad/src/math.rs exactly (same rounding
    // direction as the on-chain program) via zrp-launch-keys.ts's own
    // quoteZrpBuy/quoteZrpSell - a client-shown quote must never diverge
    // from what the program will actually compute.

    private val ZERO: BigInteger = BigInteger.ZERO
    private val BPS_DENOMINATOR: BigInteger = BigInteger.valueOf(10_000)

    data class BuyQuote(val tokenOut: BigInteger, val feeLamports: BigInteger)
    data class SellQuote(val solOut: BigInteger, val feeLamports: BigInteger)

    fun quoteZrpBuy(
        virtualSolReserves: BigInteger,
        virtualTokenReserves: BigInteger,
        solIn: BigInteger,
        buyFeeBps: Int,
    ): BuyQuote {
        if (solIn <= ZERO) return BuyQuote(ZERO, ZERO)
        val feeLamports = solIn.multiply(BigInteger.valueOf(buyFeeBps.toLong())).divide(BPS_DENOMINATOR)
        val solAfterFee = solIn.subtract(feeLamports)
        val k = virtualSolReserves.multiply(virtualTokenReserves)
        val newVirtualSol = virtualSolReserves.add(solAfterFee)
        if (newVirtualSol <= ZERO) return BuyQuote(ZERO, feeLamports)
        // ceil(k / newVirtualSol), matches math.rs
        val newVirtualToken = k.add(newVirtualSol).subtract(BigInteger.ONE).divide(newVirtualSol)
        if (newVirtualToken >= virtualTokenReserves) return BuyQuote(ZERO, feeLamports)
        return BuyQuote(virtualTokenReserves.subtract(newVirtualToken), feeLamports)
    }

    fun quoteZrpSell(
        virtualSolReserves: BigInteger,
        virtualTokenReserves: BigInteger,
        tokenIn: BigInteger,
        sellFeeBps: Int,
    ): SellQuote {
        if (tokenIn <= ZERO) return SellQuote(ZERO, ZERO)
        val k = virtualSolReserves.multiply(virtualTokenReserves)
        val newVirtualToken = virtualTokenReserves.add(tokenIn)
        val newVirtualSol = k.divide(newVirtualToken) // floor, matches math.rs
        if (newVirtualSol >= virtualSolReserves) return SellQuote(ZERO, ZERO)
        val solOutBeforeFee = virtualSolReserves.subtract(newVirtualSol)
        val feeLamports = solOutBeforeFee.multiply(BigInteger.valueOf(sellFeeBps.toLong())).divide(BPS_DENOMINATOR)
        return SellQuote(solOutBeforeFee.subtract(feeLamports), feeLamports)
    }

    fun applySlippageDown(amount: BigInteger, slippageBps: Int): BigInteger =
        amount.multiply(BigInteger.valueOf((10_000 - slippageBps).toLong())).divide(BPS_DENOMINATOR)

    fun applySlippageUp(amount: BigInteger, slippageBps: Int): BigInteger =
        amount.multiply(BigInteger.valueOf((10_000 + slippageBps).toLong())).divide(BPS_DENOMINATOR)

    // ───────────────────────── Instruction encoding ─────────────────────────
    // Anchor's sighash convention, unchanged since 0.26: an 8-byte
    // discriminator (first 8 bytes of sha256("<namespace>:<name>")) followed
    // by Borsh-encoded args in declaration order. Hand-encoded here, exactly
    // like zrp-launch-keys.ts, since there is no committed IDL to drive
    // @coral-xyz/anchor-equivalent machinery client-side.

    fun anchorDiscriminator(namespace: String, name: String): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest("$namespace:$name".toByteArray(Charsets.UTF_8))
        return hash.copyOfRange(0, 8)
    }

    /** Borsh string: u32 LE length prefix + UTF-8 bytes. */
    private fun borshString(value: String): ByteArray {
        val utf8 = value.toByteArray(Charsets.UTF_8)
        val out = ByteArray(4 + utf8.size)
        out[0] = (utf8.size and 0xFF).toByte()
        out[1] = ((utf8.size shr 8) and 0xFF).toByte()
        out[2] = ((utf8.size shr 16) and 0xFF).toByte()
        out[3] = ((utf8.size shr 24) and 0xFF).toByte()
        utf8.copyInto(out, destinationOffset = 4)
        return out
    }

    fun encodeCreateAndBuyIx(name: String, symbol: String, uri: String, initialBuyLamports: BigInteger, minTokensOut: BigInteger): ByteArray {
        return anchorDiscriminator("global", "create_and_buy") +
            borshString(name) + borshString(symbol) + borshString(uri) +
            u64LEBytes(initialBuyLamports) + u64LEBytes(minTokensOut)
    }

    fun encodeBuyIx(solIn: BigInteger, minTokensOut: BigInteger): ByteArray =
        anchorDiscriminator("global", "buy") + u64LEBytes(solIn) + u64LEBytes(minTokensOut)

    fun encodeSellIx(tokenIn: BigInteger, minSolOut: BigInteger): ByteArray =
        anchorDiscriminator("global", "sell") + u64LEBytes(tokenIn) + u64LEBytes(minSolOut)

    fun encodeGraduateIx(): ByteArray = anchorDiscriminator("global", "graduate")

    // ───────────────────────── Account decoding ─────────────────────────
    // Server-authoritative data only - this app never trusts a client-
    // claimed price/fee/balance; every quote is computed fresh here from
    // real account bytes read from RPC.

    data class GlobalConfig(
        val authority: SolanaPublicKey,
        val feeRecipient: SolanaPublicKey,
        val migrationAuthority: SolanaPublicKey,
        val creationFeeLamports: BigInteger,
        val buyFeeBps: Int,
        val sellFeeBps: Int,
        val initialVirtualSolReserves: BigInteger,
        val initialVirtualTokenReserves: BigInteger,
        val tokenTotalSupply: BigInteger,
        val graduationSolTarget: BigInteger,
        val tokenDecimals: Int,
        val bump: Int,
    )

    fun decodeGlobalConfig(data: ByteArray): GlobalConfig {
        var o = 8 // skip the 8-byte Anchor account discriminator
        fun readPubkey(): SolanaPublicKey { val pk = SolanaPublicKey(data.copyOfRange(o, o + 32)); o += 32; return pk }
        fun readU64(): BigInteger { val v = data.readU64LE(o); o += 8; return v }
        val authority = readPubkey()
        val feeRecipient = readPubkey()
        val migrationAuthority = readPubkey()
        val creationFeeLamports = readU64()
        val buyFeeBps = (data[o].toInt() and 0xFF) or ((data[o + 1].toInt() and 0xFF) shl 8); o += 2
        val sellFeeBps = (data[o].toInt() and 0xFF) or ((data[o + 1].toInt() and 0xFF) shl 8); o += 2
        val initialVirtualSolReserves = readU64()
        val initialVirtualTokenReserves = readU64()
        val tokenTotalSupply = readU64()
        val graduationSolTarget = readU64()
        val tokenDecimals = data[o].toInt() and 0xFF; o += 1
        val bump = data[o].toInt() and 0xFF
        return GlobalConfig(
            authority, feeRecipient, migrationAuthority, creationFeeLamports,
            buyFeeBps, sellFeeBps, initialVirtualSolReserves, initialVirtualTokenReserves,
            tokenTotalSupply, graduationSolTarget, tokenDecimals, bump
        )
    }

    data class BondingCurve(
        val mint: SolanaPublicKey,
        val creator: SolanaPublicKey,
        val virtualSolReserves: BigInteger,
        val virtualTokenReserves: BigInteger,
        val realSolReserves: BigInteger,
        val realTokenReserves: BigInteger,
        val tokenTotalSupply: BigInteger,
        val complete: Boolean,
        val migrated: Boolean,
        val createdAt: BigInteger,
        val bump: Int,
    )

    fun decodeBondingCurve(data: ByteArray): BondingCurve {
        var o = 8
        fun readPubkey(): SolanaPublicKey { val pk = SolanaPublicKey(data.copyOfRange(o, o + 32)); o += 32; return pk }
        fun readU64(): BigInteger { val v = data.readU64LE(o); o += 8; return v }
        val mint = readPubkey()
        val creator = readPubkey()
        val virtualSolReserves = readU64()
        val virtualTokenReserves = readU64()
        val realSolReserves = readU64()
        val realTokenReserves = readU64()
        val tokenTotalSupply = readU64()
        val complete = data[o] == 1.toByte(); o += 1
        val migrated = data[o] == 1.toByte(); o += 1
        val createdAt = readU64()
        val bump = data[o].toInt() and 0xFF
        return BondingCurve(
            mint, creator, virtualSolReserves, virtualTokenReserves, realSolReserves,
            realTokenReserves, tokenTotalSupply, complete, migrated, createdAt, bump
        )
    }

    // ───────────────────────── Event parsing ─────────────────────────
    // anchor-lang's emit! (never emit_cpi!) writes via sol_log_data, which
    // shows up in a confirmed transaction's meta.logMessages as
    // "Program data: <base64>" - discriminator+Borsh-fields under the
    // "event:" sighash namespace. This only ever runs against
    // logMessages fetched directly from an RPC-confirmed transaction,
    // never a client's claimed event.

    data class TokenCreatedEvent(
        val mint: SolanaPublicKey, val creator: SolanaPublicKey, val bondingCurve: SolanaPublicKey,
        val name: String, val symbol: String, val uri: String,
        val virtualSolReserves: BigInteger, val virtualTokenReserves: BigInteger,
        val tokenTotalSupply: BigInteger, val timestamp: BigInteger,
    )

    data class TradeEvent(
        val mint: SolanaPublicKey, val trader: SolanaPublicKey, val isBuy: Boolean,
        val solAmount: BigInteger, val tokenAmount: BigInteger, val feeLamports: BigInteger,
        val virtualSolReserves: BigInteger, val virtualTokenReserves: BigInteger,
        val realSolReserves: BigInteger, val realTokenReserves: BigInteger, val timestamp: BigInteger,
    )

    data class GraduateEvent(
        val mint: SolanaPublicKey, val bondingCurve: SolanaPublicKey,
        val realSolReservesMigrated: BigInteger, val realTokenReservesMigrated: BigInteger,
        val migrationAuthority: SolanaPublicKey, val timestamp: BigInteger,
    )

    private class FieldReader(private val data: ByteArray) {
        private var o = 0
        fun pubkey(): SolanaPublicKey { val pk = SolanaPublicKey(data.copyOfRange(o, o + 32)); o += 32; return pk }
        fun u64(): BigInteger { val v = data.readU64LE(o); o += 8; return v }
        fun bool(): Boolean { val v = data[o] == 1.toByte(); o += 1; return v }
        fun string(): String {
            val len = (data[o].toInt() and 0xFF) or ((data[o + 1].toInt() and 0xFF) shl 8) or
                ((data[o + 2].toInt() and 0xFF) shl 16) or ((data[o + 3].toInt() and 0xFF) shl 24)
            o += 4
            val s = String(data, o, len, Charsets.UTF_8)
            o += len
            return s
        }
    }

    private fun findEventLogs(logMessages: List<String>, eventName: String): List<ByteArray> {
        val discriminator = anchorDiscriminator("event", eventName)
        val matches = mutableListOf<ByteArray>()
        for (line in logMessages) {
            if (!line.startsWith("Program data: ")) continue
            val decoded = try {
                Base64.getDecoder().decode(line.substring("Program data: ".length).trim())
            } catch (_: Exception) {
                continue
            }
            if (decoded.size < 8) continue
            if (decoded.copyOfRange(0, 8).contentEquals(discriminator)) {
                matches.add(decoded.copyOfRange(8, decoded.size))
            }
        }
        return matches
    }

    fun parseTokenCreatedEvents(logMessages: List<String>): List<TokenCreatedEvent> =
        findEventLogs(logMessages, "TokenCreatedEvent").map { body ->
            val r = FieldReader(body)
            TokenCreatedEvent(
                mint = r.pubkey(), creator = r.pubkey(), bondingCurve = r.pubkey(),
                name = r.string(), symbol = r.string(), uri = r.string(),
                virtualSolReserves = r.u64(), virtualTokenReserves = r.u64(),
                tokenTotalSupply = r.u64(), timestamp = r.u64(),
            )
        }

    fun parseTradeEvents(logMessages: List<String>): List<TradeEvent> =
        findEventLogs(logMessages, "TradeEvent").map { body ->
            val r = FieldReader(body)
            TradeEvent(
                mint = r.pubkey(), trader = r.pubkey(), isBuy = r.bool(),
                solAmount = r.u64(), tokenAmount = r.u64(), feeLamports = r.u64(),
                virtualSolReserves = r.u64(), virtualTokenReserves = r.u64(),
                realSolReserves = r.u64(), realTokenReserves = r.u64(), timestamp = r.u64(),
            )
        }

    fun parseGraduateEvents(logMessages: List<String>): List<GraduateEvent> =
        findEventLogs(logMessages, "GraduateEvent").map { body ->
            val r = FieldReader(body)
            GraduateEvent(
                mint = r.pubkey(), bondingCurve = r.pubkey(),
                realSolReservesMigrated = r.u64(), realTokenReservesMigrated = r.u64(),
                migrationAuthority = r.pubkey(), timestamp = r.u64(),
            )
        }
}
