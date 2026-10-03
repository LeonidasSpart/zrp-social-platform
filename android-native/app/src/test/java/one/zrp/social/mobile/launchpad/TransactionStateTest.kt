package one.zrp.social.mobile.launchpad

import org.junit.Assert.assertEquals
import org.junit.Test

class TransactionStateTest {
    @Test
    fun `in-flight states are exactly preparing through confirming`() {
        assertEquals(false, TransactionState.Idle.isInFlight())
        assertEquals(true, TransactionState.Preparing.isInFlight())
        assertEquals(true, TransactionState.AwaitingSignature.isInFlight())
        assertEquals(true, TransactionState.Signed("sig").isInFlight())
        assertEquals(true, TransactionState.Submitted("sig").isInFlight())
        assertEquals(true, TransactionState.Confirming("sig").isInFlight())
        assertEquals(false, TransactionState.Confirmed("sig").isInFlight())
        assertEquals(false, TransactionState.Failed(TransactionFailureReason.TIMEOUT, "x").isInFlight())
    }

    @Test
    fun `terminal states are exactly confirmed and failed`() {
        assertEquals(false, TransactionState.Idle.isTerminal())
        assertEquals(false, TransactionState.Preparing.isTerminal())
        assertEquals(false, TransactionState.AwaitingSignature.isTerminal())
        assertEquals(false, TransactionState.Confirming("sig").isTerminal())
        assertEquals(true, TransactionState.Confirmed("sig").isTerminal())
        assertEquals(true, TransactionState.Failed(TransactionFailureReason.USER_REJECTED, "x").isTerminal())
    }

    @Test
    fun `no state is both in-flight and terminal`() {
        val all = listOf(
            TransactionState.Idle, TransactionState.Preparing, TransactionState.AwaitingSignature,
            TransactionState.Signed("s"), TransactionState.Submitted("s"), TransactionState.Confirming("s"),
            TransactionState.Confirmed("s"), TransactionState.Failed(TransactionFailureReason.NETWORK_ERROR, "x"),
        )
        for (state in all) {
            assertEquals("state $state must not be both in-flight and terminal", false, state.isInFlight() && state.isTerminal())
        }
    }
}
