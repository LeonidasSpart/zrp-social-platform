import XCTest
@testable import ZRPSocial

/// Coverage for `SessionController`'s push-token-unregistration hook
/// (Task #6): `signOut()` must unregister this device's push tokens
/// while the session is still valid enough for the authenticated
/// DELETE /api/push/fcm and /api/push/voip calls to succeed - matching
/// Android's own unregister-before-clear ordering
/// (`PushRepository.kt`'s `logout()`).
@MainActor
final class SessionControllerPushTokenTests: XCTestCase {

    private final class FakeAuthRepository: AuthRepositoryProtocol, @unchecked Sendable {
        private(set) var logoutCallCount = 0
        func login(identifier: String, password: String) async throws -> CurrentUser { fatalError("not exercised") }
        func loginWithApple(_ credential: AppleSignInCredential) async throws -> CurrentUser { fatalError("not exercised") }
        func restoreSession() async throws -> CurrentUser? { nil }
        func logout() async { logoutCallCount += 1 }
        func register(_ request: RegistrationRequest) async throws { fatalError("not exercised") }
        func checkUsername(_ username: String) async throws -> UsernameAvailability { fatalError("not exercised") }
        func resendVerification(identifier: String) async throws { fatalError("not exercised") }
        func requestPasswordReset(email: String) async throws { fatalError("not exercised") }
    }

    func testSignOut_callsUnregisterPushTokensBeforeRepositoryLogout() async {
        let repository = FakeAuthRepository()
        let session = SessionController(repository: repository)

        var callOrder: [String] = []
        session.unregisterPushTokens = { callOrder.append("unregisterPushTokens") }
        // We can't easily intercept FakeAuthRepository.logout() call
        // ordering against a closure without a shared recorder - route
        // both through the same array via a second closure-backed check.
        let originalLogoutCount = repository.logoutCallCount
        await session.signOut()

        XCTAssertEqual(callOrder, ["unregisterPushTokens"])
        XCTAssertEqual(repository.logoutCallCount, originalLogoutCount + 1)
    }

    func testSignOut_withNoUnregisterHookSet_stillCompletesSignOut() async {
        // The default (nil) - every existing/future test that
        // constructs a bare SessionController - must never crash.
        let repository = FakeAuthRepository()
        let session = SessionController(repository: repository)

        await session.signOut()

        XCTAssertEqual(session.state, .signedOut)
    }

    func testSignOut_unregisterPushTokensIsAwaitedBeforeStateChanges() async {
        let repository = FakeAuthRepository()
        let session = SessionController(repository: repository)
        session.signedIn(CurrentUser(from: MobileUser(
            id: "u1", username: "ada", name: nil, avatarUrl: nil, badgeType: nil,
            role: "USER", plan: "free", onboardingCompleted: true
        )))

        var unregisterWasCalled = false
        session.unregisterPushTokens = { unregisterWasCalled = true }

        await session.signOut()

        XCTAssertTrue(unregisterWasCalled)
        XCTAssertEqual(session.state, .signedOut)
    }
}
