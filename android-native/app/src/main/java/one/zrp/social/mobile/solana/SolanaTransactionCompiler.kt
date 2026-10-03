package one.zrp.social.mobile.solana

import java.io.ByteArrayOutputStream

/**
 * Compiles a legacy Solana transaction message - the raw bytes Mobile
 * Wallet Adapter's signAndSendTransactions expects (unsigned, with
 * zeroed 64-byte signature placeholders for each required signer).
 *
 * Deliberately NOT a byte-for-byte transcription of @solana/web3.js's own
 * Transaction.compileMessage, which has its own specific (and, from
 * reading its source, non-obvious) tie-breaking order for same-category
 * accounts. That exact tie-break order has no on-chain semantic meaning:
 * the Solana runtime only requires that (a) the fee payer is index 0,
 * (b) all signer accounts precede all non-signer accounts, (c) within
 * each, writable accounts precede read-only ones, and (d) the message
 * header's three counts correctly describe those boundaries - the
 * specific order WITHIN a category is a serialization choice, not a
 * protocol requirement. This class implements exactly (a)-(d) via a
 * simple dedupe-and-partition algorithm, verified correct (not merely
 * self-consistent) by round-tripping transactions compiled with this
 * exact algorithm through the real @solana/web3.js Transaction.from()
 * deserializer - for both a single-signer (buy/sell) and a two-signer
 * (create_and_buy, which also signs with the new mint keypair) case -
 * and confirming every field (fee payer, blockhash, program ID,
 * instruction data, and every account's pubkey/isSigner/isWritable)
 * decodes back out exactly as given. See the commit introducing this
 * file for the verification script.
 */
object SolanaTransactionCompiler {
    data class AccountMeta(val pubkey: SolanaPublicKey, val isSigner: Boolean, val isWritable: Boolean)
    data class CompiledInstruction(val programId: SolanaPublicKey, val accounts: List<AccountMeta>, val data: ByteArray)

    private data class MutableMeta(val pubkey: SolanaPublicKey, var isSigner: Boolean, var isWritable: Boolean, val firstSeen: Int)

    /**
     * Builds the unsigned, serialized transaction MWA signs: a compact-u16
     * count of required signatures, that many 64-byte zero placeholders,
     * then the compiled message (header + account keys + blockhash +
     * instructions).
     */
    fun compileUnsignedTransaction(
        feePayer: SolanaPublicKey,
        instructions: List<CompiledInstruction>,
        recentBlockhashBytes: ByteArray,
    ): ByteArray {
        require(recentBlockhashBytes.size == 32) { "A blockhash is 32 bytes" }

        val metasByKey = LinkedHashMap<String, MutableMeta>()
        var order = 0
        fun addMeta(pubkey: SolanaPublicKey, isSigner: Boolean, isWritable: Boolean) {
            val key = pubkey.toBase58()
            val existing = metasByKey[key]
            if (existing != null) {
                existing.isSigner = existing.isSigner || isSigner
                existing.isWritable = existing.isWritable || isWritable
            } else {
                metasByKey[key] = MutableMeta(pubkey, isSigner, isWritable, order++)
            }
        }
        addMeta(feePayer, isSigner = true, isWritable = true)
        for (ix in instructions) {
            for (acc in ix.accounts) addMeta(acc.pubkey, acc.isSigner, acc.isWritable)
            addMeta(ix.programId, isSigner = false, isWritable = false)
        }

        val all = metasByKey.values
        val feePayerKey = feePayer.toBase58()
        val signerWritable = all.filter { it.isSigner && it.isWritable && it.pubkey.toBase58() != feePayerKey }.sortedBy { it.firstSeen }
        val signerReadonly = all.filter { it.isSigner && !it.isWritable }.sortedBy { it.firstSeen }
        val nonSignerWritable = all.filter { !it.isSigner && it.isWritable }.sortedBy { it.firstSeen }
        val nonSignerReadonly = all.filter { !it.isSigner && !it.isWritable }.sortedBy { it.firstSeen }
        val feePayerMeta = all.first { it.pubkey.toBase58() == feePayerKey }

        val orderedKeys = buildList {
            add(feePayerMeta)
            addAll(signerWritable)
            addAll(signerReadonly)
            addAll(nonSignerWritable)
            addAll(nonSignerReadonly)
        }
        val indexOf = orderedKeys.withIndex().associate { (i, m) -> m.pubkey.toBase58() to i }

        val numRequiredSignatures = 1 + signerWritable.size + signerReadonly.size
        val numReadonlySignedAccounts = signerReadonly.size
        val numReadonlyUnsignedAccounts = nonSignerReadonly.size

        val out = ByteArrayOutputStream()
        writeCompactU16(out, numRequiredSignatures)
        repeat(numRequiredSignatures) { out.write(ByteArray(64)) } // zeroed signature placeholders

        out.write(numRequiredSignatures)
        out.write(numReadonlySignedAccounts)
        out.write(numReadonlyUnsignedAccounts)

        writeCompactU16(out, orderedKeys.size)
        for (m in orderedKeys) out.write(m.pubkey.bytes)

        out.write(recentBlockhashBytes)

        writeCompactU16(out, instructions.size)
        for (ix in instructions) {
            out.write(indexOf.getValue(ix.programId.toBase58()))
            writeCompactU16(out, ix.accounts.size)
            for (acc in ix.accounts) out.write(indexOf.getValue(acc.pubkey.toBase58()))
            writeCompactU16(out, ix.data.size)
            out.write(ix.data)
        }

        return out.toByteArray()
    }

    /** Solana's "compact-u16" varint: 7 bits per byte, high bit set on every byte but the last. */
    private fun writeCompactU16(out: ByteArrayOutputStream, value: Int) {
        require(value >= 0) { "compact-u16 value must be non-negative, got $value" }
        var v = value
        while (true) {
            var elem = v and 0x7f
            v = v ushr 7
            if (v == 0) {
                out.write(elem)
                return
            }
            elem = elem or 0x80
            out.write(elem)
        }
    }
}
