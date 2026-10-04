package one.zrp.social.mobile.launchpad

import android.net.Uri
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.Solana
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import one.zrp.social.mobile.solana.Base58

/**
 * The ONLY file in this app that talks to Solana Mobile Wallet Adapter
 * directly - every other Launchpad file (ViewModels, repository, quote
 * math, instruction encoding) only ever sees this wrapper's plain
 * WalletSignResult/WalletAuthResult types, never MWA's own API surface.
 *
 * Verified against the real com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.6
 * sources (fetched and read directly from Maven Central - this sandbox has
 * no Android SDK/Gradle cache to compile against, but the library's actual
 * source, not a guess at its API, is what this is written against). The
 * first version of this file guessed a different, older shape of the API
 * (manually calling authorize()/reauthorize() inside the transact{} block
 * with identityUri/iconUri/identityName implicitly in scope) and failed to
 * compile in CI with "Unresolved reference" on exactly those names - the
 * real MobileWalletAdapter.transact() performs authorize/reauthorize
 * ITSELF before invoking the caller's block, and hands the block an
 * already-completed AuthorizationResult; the adapter's own authToken var
 * (persisted on this class's single long-lived instance) is what makes a
 * second call reauthorize instead of prompting a fresh wallet selection.
 *
 * Non-custodial by construction: this class never requests, receives, or
 * stores a private key or seed phrase. It hands MWA an unsigned
 * transaction's raw bytes; a separate wallet app (Phantom/Solflare/
 * Backpack) does the actual signing and returns only the signature. ZRP
 * never custodies funds - see capability-matrix.ts and
 * native-payment-policy.ts for the broader policy this follows.
 */
class SolanaWalletConnector(private val activityResultSender: ActivityResultSender) {
    private val identityUri = Uri.parse("https://zrp.one")
    private val iconUri = Uri.parse("/favicon.ico")
    private val identityName = "ZRP Social"
    private val walletAdapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = identityUri,
            iconUri = iconUri,
            identityName = identityName,
        )
    ).apply {
        // ZRP Launchpad is mainnet-only (see zrp-launch-keys.ts) - every
        // signature/authorization this adapter requests is scoped to it.
        blockchain = Solana.Mainnet
    }

    /** The connected wallet's base58 address, from the wallet-reported AuthorizationResult - never a client-side guess. */
    data class WalletAuthResult(val publicKeyBase58: String)

    sealed class WalletSignResult {
        data class Success(val signatures: List<String>) : WalletSignResult()
        data object NoWalletFound : WalletSignResult()
        data class Failure(val message: String) : WalletSignResult()
    }

    /**
     * Opens the wallet-selection/authorization flow (first call on this
     * instance) or silently reauthorizes using the adapter's own retained
     * auth token (subsequent calls - see the class doc), then signs and
     * submits the given unsigned transaction bytes in one round trip via
     * MWA's own signAndSendTransactions, so the wallet app itself
     * broadcasts the transaction. This method's result is only ever used
     * to know WHICH signature to then poll for and independently verify
     * server-side (see LaunchpadRepository) - never treated as proof of
     * success on its own.
     */
    suspend fun signAndSendTransaction(transactionBytes: ByteArray): Pair<WalletAuthResult?, WalletSignResult> {
        val result = walletAdapter.transact(activityResultSender) { _ ->
            signAndSendTransactions(arrayOf(transactionBytes))
        }

        return when (result) {
            is TransactionResult.Success -> {
                val auth = WalletAuthResult(
                    publicKeyBase58 = Base58.encode(result.authResult.publicKey),
                )
                val signatures = result.payload.signatures.map { Base58.encode(it) }
                auth to WalletSignResult.Success(signatures)
            }
            is TransactionResult.NoWalletFound -> null to WalletSignResult.NoWalletFound
            is TransactionResult.Failure -> null to WalletSignResult.Failure(result.message)
        }
    }
}

/**
 * Maps a WalletSignResult into this app's own TransactionFailureReason
 * taxonomy - kept separate from the connector itself so the mapping rules
 * (which error message substrings mean what) can be adjusted without
 * touching the MWA call site. MWA has no distinct "user rejected" result
 * type of its own - a declined authorization/signature surfaces as a
 * Failure with a specific message (see MobileWalletAdapter.kt's
 * ERROR_NOT_SIGNED -> "User did not authorize signing" mapping), so that
 * message text is what this function matches on.
 */
fun SolanaWalletConnector.WalletSignResult.toFailureReason(): TransactionFailureReason? = when (this) {
    is SolanaWalletConnector.WalletSignResult.Success -> null
    is SolanaWalletConnector.WalletSignResult.NoWalletFound -> TransactionFailureReason.NO_WALLET_FOUND
    is SolanaWalletConnector.WalletSignResult.Failure -> when {
        message.contains("did not authorize", ignoreCase = true) ||
            message.contains("declin", ignoreCase = true) ||
            message.contains("reject", ignoreCase = true) ->
            TransactionFailureReason.USER_REJECTED
        message.contains("blockhash", ignoreCase = true) -> TransactionFailureReason.BLOCKHASH_EXPIRED
        message.contains("insufficient", ignoreCase = true) -> TransactionFailureReason.INSUFFICIENT_FUNDS
        message.contains("timed out", ignoreCase = true) || message.contains("timeout", ignoreCase = true) ->
            TransactionFailureReason.TIMEOUT
        else -> TransactionFailureReason.TRANSACTION_FAILED
    }
}
