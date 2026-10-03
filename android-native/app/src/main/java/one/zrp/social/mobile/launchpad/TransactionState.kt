package one.zrp.social.mobile.launchpad

/**
 * Explicit state machine every ZRP Launchpad on-chain action (create, buy,
 * sell) exposes to its screen - the UI must render a distinct state for
 * each of these, never collapse them into one generic "loading" spinner.
 * Mirrors the CREATE/BUY/SELL flows specified for cross-platform parity.
 */
sealed class TransactionState {
    data object Idle : TransactionState()
    data object Preparing : TransactionState()
    data object AwaitingSignature : TransactionState()
    data class Signed(val signature: String) : TransactionState()
    data class Submitted(val signature: String) : TransactionState()
    data class Confirming(val signature: String) : TransactionState()
    data class Confirmed(val signature: String) : TransactionState()
    data class Failed(val reason: TransactionFailureReason, val message: String) : TransactionState()
}

enum class TransactionFailureReason {
    USER_REJECTED,
    INSUFFICIENT_FUNDS,
    SLIPPAGE_EXCEEDED,
    BLOCKHASH_EXPIRED,
    NETWORK_ERROR,
    TRANSACTION_FAILED,
    TIMEOUT,
    NO_WALLET_FOUND,
    VERIFICATION_FAILED,
}

/** True for any state that should show a spinner/progress UI (never leave the user on this indefinitely). */
fun TransactionState.isInFlight(): Boolean = this is TransactionState.Preparing ||
    this is TransactionState.AwaitingSignature ||
    this is TransactionState.Signed ||
    this is TransactionState.Submitted ||
    this is TransactionState.Confirming

fun TransactionState.isTerminal(): Boolean = this is TransactionState.Confirmed || this is TransactionState.Failed
