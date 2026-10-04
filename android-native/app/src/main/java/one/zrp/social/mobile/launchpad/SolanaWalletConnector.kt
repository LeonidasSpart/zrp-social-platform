package one.zrp.social.mobile.launchpad

import android.net.Uri
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.RpcCluster
import com.solana.mobilewalletadapter.clientlib.TransactionResult

/**
 * The ONLY file in this app that talks to Solana Mobile Wallet Adapter
 * directly - every other Launchpad file (ViewModels, repository, quote
 * math, instruction encoding) only ever sees this wrapper's plain
 * WalletSignResult/WalletAuthResult types, never MWA's own API surface.
 * That isolation is deliberate: this app has no Android SDK access to
 * compile-check against in this sandbox (see the capability-matrix.ts
 * citation for why this is the Android-appropriate, non-custodial
 * signing path in the first place), so if the exact MWA 2.x API differs
 * from what's written here once a real build checks it, only this one
 * file needs correcting - nothing downstream of it does.
 *
 * Non-custodial by construction: this class never requests, receives, or
 * stores a private key or seed phrase. It hands MWA an unsigned
 * transaction's raw bytes; a separate wallet app (Phantom/Solflare/
 * Backpack) does the actual signing and returns only the signature. ZRP
 * never custodies funds - see capability-matrix.ts and
 * native-payment-policy.ts for the broader policy this follows.
 */
class SolanaWalletConnector(private val activityResultSender: ActivityResultSender) {
    private val walletAdapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = Uri.parse("https://zrp.one"),
            iconUri = Uri.parse("/favicon.ico"),
            identityName = "ZRP Social",
        )
    )

    /** The connected wallet's base58 address and the MWA auth token to reuse across calls in the same session, avoiding a re-authorize prompt every time. */
    data class WalletAuthResult(val publicKeyBase58: String, val authToken: String)

    sealed class WalletSignResult {
        data class Success(val signatures: List<String>) : WalletSignResult()
        data object UserRejected : WalletSignResult()
        data object NoWalletFound : WalletSignResult()
        data class Failure(val message: String) : WalletSignResult()
    }

    /**
     * Opens the wallet-selection/authorization flow (first call in a
     * session) or reuses a prior auth token (subsequent calls), then
     * signs and submits the given unsigned transaction bytes in one
     * round trip - this is MWA's own signAndSendTransactions, so the
     * wallet app itself broadcasts the transaction; this method's result
     * is only ever used to know WHICH signature to then poll for and
     * independently verify server-side (see LaunchpadRepository) - never
     * treated as proof of success on its own.
     */
    suspend fun signAndSendTransaction(
        transactionBytes: ByteArray,
        priorAuthToken: String? = null,
    ): Pair<WalletAuthResult?, WalletSignResult> {
        var resultingAuth: WalletAuthResult? = null
        val result = walletAdapter.transact(activityResultSender) {
            val authResult = if (priorAuthToken != null) {
                reauthorize(identityUri, iconUri, identityName, priorAuthToken)
            } else {
                authorize(identityUri, iconUri, identityName, RpcCluster.MainnetBeta)
            }
            resultingAuth = WalletAuthResult(
                publicKeyBase58 = one.zrp.social.mobile.solana.Base58.encode(authResult.publicKey),
                authToken = authResult.authToken,
            )
            signAndSendTransactions(arrayOf(transactionBytes))
        }

        val signResult = when (result) {
            is TransactionResult.Success -> {
                val signatures = result.payload.signatures.map { sig ->
                    one.zrp.social.mobile.solana.Base58.encode(sig)
                }
                WalletSignResult.Success(signatures)
            }
            is TransactionResult.NoWalletFound -> WalletSignResult.NoWalletFound
            is TransactionResult.Failure -> {
                // MWA surfaces a user-declined authorization/signature as
                // a specific failure it knows about - mapped to
                // USER_REJECTED upstream via message inspection since
                // the exact exception type here is one more thing a real
                // build must confirm (see this file's own class comment).
                WalletSignResult.Failure(result.e.message ?: "Wallet signing failed.")
            }
        }
        return resultingAuth to signResult
    }
}

/**
 * Maps a WalletSignResult into this app's own TransactionFailureReason
 * taxonomy - kept separate from the connector itself so the mapping rules
 * (which error message substrings mean what) can be adjusted without
 * touching the MWA call site.
 */
fun SolanaWalletConnector.WalletSignResult.toFailureReason(): TransactionFailureReason? = when (this) {
    is SolanaWalletConnector.WalletSignResult.Success -> null
    is SolanaWalletConnector.WalletSignResult.NoWalletFound -> TransactionFailureReason.NO_WALLET_FOUND
    is SolanaWalletConnector.WalletSignResult.UserRejected -> TransactionFailureReason.USER_REJECTED
    is SolanaWalletConnector.WalletSignResult.Failure -> when {
        message.contains("declin", ignoreCase = true) || message.contains("reject", ignoreCase = true) ->
            TransactionFailureReason.USER_REJECTED
        message.contains("blockhash", ignoreCase = true) -> TransactionFailureReason.BLOCKHASH_EXPIRED
        message.contains("insufficient", ignoreCase = true) -> TransactionFailureReason.INSUFFICIENT_FUNDS
        message.contains("timeout", ignoreCase = true) -> TransactionFailureReason.TIMEOUT
        else -> TransactionFailureReason.TRANSACTION_FAILED
    }
}
