import XCTest
@testable import ZRPSocial

/// Coverage for `PushCoordinator`'s testable logic: device-token
/// lifecycle (hex encoding, register/unregister via
/// `PushTokenRepositoryProtocol`) and routing a tapped notification's
/// `userInfo` into the app's existing `DeepLinkInbox` queue. The
/// UNUserNotificationCenter/AppDelegate wiring itself is not
/// constructible in XCTest without a running app, so this exercises
/// everything downstream of "AppDelegate handed us this data."
@MainActor
final class PushCoordinatorTests: XCTestCase {

    private final class FakePushTokenRepository: PushTokenRepositoryProtocol, @unchecked Sendable {
        private(set) var registeredAlertTokens: [String] = []
        private(set) var unregisteredAlertTokens: [String] = []
        private(set) var registeredVoipTokens: [String] = []
        private(set) var unregisteredVoipTokens: [String] = []
        var shouldThrow = false

        func registerAlertToken(_ token: String) async throws {
            if shouldThrow { throw ApiError.transport(underlying: "boom") }
            registeredAlertTokens.append(token)
        }
        func unregisterAlertToken(_ token: String) async throws {
            if shouldThrow { throw ApiError.transport(underlying: "boom") }
            unregisteredAlertTokens.append(token)
        }
        func registerVoipToken(_ token: String) async throws {
            if shouldThrow { throw ApiError.transport(underlying: "boom") }
            registeredVoipTokens.append(token)
        }
        func unregisterVoipToken(_ token: String) async throws {
            if shouldThrow { throw ApiError.transport(underlying: "boom") }
            unregisteredVoipTokens.append(token)
        }
    }

    // MARK: - Device token lifecycle

    func testDidRegisterDeviceToken_hexEncodesTheRawToken() {
        let repository = FakePushTokenRepository()
        let coordinator = PushCoordinator(repository: repository)
        coordinator.didRegisterDeviceToken(Data([0x01, 0x02, 0xAB, 0xFF]))
        XCTAssertEqual(coordinator.pendingDeviceTokenHex, "0102abff")
    }

    func testRegisterPendingTokenIfNeeded_registersTheStoredToken() async {
        let repository = FakePushTokenRepository()
        let coordinator = PushCoordinator(repository: repository)
        coordinator.didRegisterDeviceToken(Data([0x0A, 0x0B]))

        await coordinator.registerPendingTokenIfNeeded()

        XCTAssertEqual(repository.registeredAlertTokens, ["0a0b"])
    }

    func testRegisterPendingTokenIfNeeded_noOpWhenNoTokenHasArrivedYet() async {
        let repository = FakePushTokenRepository()
        let coordinator = PushCoordinator(repository: repository)

        await coordinator.registerPendingTokenIfNeeded()

        XCTAssertTrue(repository.registeredAlertTokens.isEmpty)
    }

    func testRegisterPendingTokenIfNeeded_isSafeToCallMoreThanOnce() async {
        // Registration is an idempotent upsert server-side (see
        // /api/push/fcm's own doc comment) - calling this from both
        // `attach()` and a later sign-in must never be treated as an
        // error, and each call is independently safe to make.
        let repository = FakePushTokenRepository()
        let coordinator = PushCoordinator(repository: repository)
        coordinator.didRegisterDeviceToken(Data([0x01]))

        await coordinator.registerPendingTokenIfNeeded()
        await coordinator.registerPendingTokenIfNeeded()

        XCTAssertEqual(repository.registeredAlertTokens, ["01", "01"])
    }

    func testDidFailToRegister_setsLastRegistrationError_andNeverThrows() {
        let coordinator = PushCoordinator(repository: FakePushTokenRepository())
        XCTAssertNil(coordinator.lastRegistrationError)
        coordinator.didFailToRegister(ApiError.transport(underlying: "no APNs entitlement"))
        XCTAssertNotNil(coordinator.lastRegistrationError)
    }

    func testUnregisterCurrentToken_callsRepositoryWithTheStoredToken() async {
        let repository = FakePushTokenRepository()
        let coordinator = PushCoordinator(repository: repository)
        coordinator.didRegisterDeviceToken(Data([0x0A, 0x0B]))

        await coordinator.unregisterCurrentToken()

        XCTAssertEqual(repository.unregisteredAlertTokens, ["0a0b"])
    }

    func testUnregisterCurrentToken_noOpWhenNoTokenWasEverRegistered() async {
        let repository = FakePushTokenRepository()
        let coordinator = PushCoordinator(repository: repository)

        await coordinator.unregisterCurrentToken()

        XCTAssertTrue(repository.unregisteredAlertTokens.isEmpty)
    }

    func testUnregisterCurrentToken_failingRepositoryCallNeverThrows() async {
        let repository = FakePushTokenRepository()
        repository.shouldThrow = true
        let coordinator = PushCoordinator(repository: repository)
        coordinator.didRegisterDeviceToken(Data([0x01]))

        // Must complete without throwing - a failed unregister on
        // sign-out must never block or crash sign-out itself.
        await coordinator.unregisterCurrentToken()
    }

    // MARK: - Notification tap routing

    func testRoute_validPayload_deliversToDeepLinkInbox() {
        let deepLinks = DeepLinkInbox()
        let coordinator = PushCoordinator(repository: FakePushTokenRepository())
        coordinator.attach(deepLinks: deepLinks, isSignedIn: { true })

        coordinator.route(userInfo: ["url": "/messages/ada"])

        XCTAssertEqual(deepLinks.pending, URL(string: "https://zrp.one/messages/ada"))
    }

    func testRoute_preservesQueryString_forCommentDeepLinks() {
        let deepLinks = DeepLinkInbox()
        let coordinator = PushCoordinator(repository: FakePushTokenRepository())
        coordinator.attach(deepLinks: deepLinks, isSignedIn: { true })

        coordinator.route(userInfo: ["url": "/post/abc123?commentId=xyz"])

        XCTAssertEqual(deepLinks.pending, URL(string: "https://zrp.one/post/abc123?commentId=xyz"))
    }

    func testRoute_missingUrlField_doesNothing() {
        let deepLinks = DeepLinkInbox()
        let coordinator = PushCoordinator(repository: FakePushTokenRepository())
        coordinator.attach(deepLinks: deepLinks, isSignedIn: { true })

        coordinator.route(userInfo: [:])

        XCTAssertNil(deepLinks.pending)
    }

    func testRoute_urlFieldNotStartingWithSlash_doesNothing() {
        // A payload with a scheme-relative or absolute URL in `url`
        // would otherwise be attacker-controlled navigation - only a
        // bare in-app path is ever accepted.
        let deepLinks = DeepLinkInbox()
        let coordinator = PushCoordinator(repository: FakePushTokenRepository())
        coordinator.attach(deepLinks: deepLinks, isSignedIn: { true })

        coordinator.route(userInfo: ["url": "https://evil.example/phish"])

        XCTAssertNil(deepLinks.pending)
    }

    func testRoute_beforeAttach_buffersAndDeliversOnAttach() {
        // A notification tap can race the app's own SwiftUI startup
        // when launching from Terminated - route() must not drop it.
        let coordinator = PushCoordinator(repository: FakePushTokenRepository())
        coordinator.route(userInfo: ["url": "/messages/ada"])

        let deepLinks = DeepLinkInbox()
        coordinator.attach(deepLinks: deepLinks, isSignedIn: { true })

        XCTAssertEqual(deepLinks.pending, URL(string: "https://zrp.one/messages/ada"))
    }

    func testRoute_nonStringUrlField_doesNothing() {
        let deepLinks = DeepLinkInbox()
        let coordinator = PushCoordinator(repository: FakePushTokenRepository())
        coordinator.attach(deepLinks: deepLinks, isSignedIn: { true })

        coordinator.route(userInfo: ["url": 12345])

        XCTAssertNil(deepLinks.pending)
    }
}
