import XCTest
@testable import ZRPSocial

/// Coverage for `VoipPushCoordinator`'s VoIP-token lifecycle - the same
/// register/unregister-on-sign-out contract as `PushCoordinatorTests`,
/// but for the separate VoIP subscription (`PushTokenRepository`'s own
/// doc comment explains why the two are independent). `PKPushRegistry`/
/// `CXProvider` themselves are not constructible from XCTest without a
/// running app, so `didReceiveIncomingPushWith`/CallKit reporting is
/// covered instead by `VoipPushPayloadParserTests` (the pure decoding
/// step) plus this app's own manual/CI verification once real APNs
/// credentials exist (see ios-native/PARITY.md).
@MainActor
final class VoipPushCoordinatorTests: XCTestCase {

    private final class FakePushTokenRepository: PushTokenRepositoryProtocol, @unchecked Sendable {
        private(set) var registeredVoipTokens: [String] = []
        private(set) var unregisteredVoipTokens: [String] = []
        var shouldThrow = false

        func registerAlertToken(_ token: String) async throws { fatalError("not exercised by these tests") }
        func unregisterAlertToken(_ token: String) async throws { fatalError("not exercised by these tests") }
        func registerVoipToken(_ token: String) async throws {
            if shouldThrow { throw ApiError.transport(underlying: "boom") }
            registeredVoipTokens.append(token)
        }
        func unregisterVoipToken(_ token: String) async throws {
            if shouldThrow { throw ApiError.transport(underlying: "boom") }
            unregisteredVoipTokens.append(token)
        }
    }

    func testDidUpdateToken_hexEncodesTheRawToken() {
        let coordinator = VoipPushCoordinator(repository: FakePushTokenRepository())
        coordinator.didUpdateToken(Data([0x01, 0x02, 0xAB, 0xFF]))
        XCTAssertEqual(coordinator.lastVoipTokenHex, "0102abff")
    }

    func testRegisterPendingTokenIfNeeded_registersTheStoredToken() async {
        let repository = FakePushTokenRepository()
        let coordinator = VoipPushCoordinator(repository: repository)
        coordinator.didUpdateToken(Data([0x0A, 0x0B]))

        await coordinator.registerPendingTokenIfNeeded()

        XCTAssertEqual(repository.registeredVoipTokens, ["0a0b"])
    }

    func testRegisterPendingTokenIfNeeded_noOpWhenNoTokenHasArrivedYet() async {
        let repository = FakePushTokenRepository()
        let coordinator = VoipPushCoordinator(repository: repository)

        await coordinator.registerPendingTokenIfNeeded()

        XCTAssertTrue(repository.registeredVoipTokens.isEmpty)
    }

    func testUnregisterCurrentToken_callsRepositoryWithTheStoredToken() async {
        let repository = FakePushTokenRepository()
        let coordinator = VoipPushCoordinator(repository: repository)
        coordinator.didUpdateToken(Data([0x0A, 0x0B]))

        await coordinator.unregisterCurrentToken()

        XCTAssertEqual(repository.unregisteredVoipTokens, ["0a0b"])
    }

    func testUnregisterCurrentToken_noOpWhenNoTokenWasEverRegistered() async {
        let repository = FakePushTokenRepository()
        let coordinator = VoipPushCoordinator(repository: repository)

        await coordinator.unregisterCurrentToken()

        XCTAssertTrue(repository.unregisteredVoipTokens.isEmpty)
    }

    func testFailingRegisterCallNeverThrows() async {
        let repository = FakePushTokenRepository()
        repository.shouldThrow = true
        let coordinator = VoipPushCoordinator(repository: repository)
        coordinator.didUpdateToken(Data([0x01]))

        // Must complete without throwing - a registration failure must
        // never crash app launch or sign-in.
        await coordinator.registerPendingTokenIfNeeded()
    }
}
