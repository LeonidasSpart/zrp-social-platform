import AVFoundation
import Foundation
import PushKit
import CallKit

/// The structured data `sendApnsVoip` (`src/lib/apns.ts`) puts in a
/// VoIP push payload, decoded and validated. Pulled out as a free
/// function/pure type rather than inlined in
/// `VoipPushCoordinator.handleIncomingPush` so payload decoding -
/// including malformed/missing-field payloads - is unit-testable
/// without constructing a `PKPushPayload`/`CXProvider` (system types
/// XCTest cannot easily exercise in isolation).
struct VoipPushPayload: Equatable {
    let callerId: String
    let callId: String
    let callerName: String
    let isVideo: Bool
}

enum VoipPushPayloadParser {
    /// `nil` for a payload missing a usable `callerId`/`callId` -
    /// exactly the payloads `VoipPushCoordinator` reports-and-ends
    /// rather than acts on (see its own doc comment on why it must
    /// still report *something* to CallKit even then).
    static func parse(_ userInfo: [AnyHashable: Any]) -> VoipPushPayload? {
        guard
            let callerId = userInfo["callerId"] as? String, !callerId.isEmpty,
            let callId = userInfo["callId"] as? String, !callId.isEmpty
        else { return nil }
        let callerName = (userInfo["callerName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? callerId
        let isVideo = (userInfo["isVideo"] as? Bool) ?? false
        return VoipPushPayload(callerId: callerId, callId: callId, callerName: callerName, isVideo: isVideo)
    }
}

/// Owns this device's PushKit VoIP subscription and reports an incoming
/// call to CallKit from it - the missing piece that lets a call actually
/// ring while this app is backgrounded, suspended, or terminated (see
/// this task's own audit: today's WebRTC calling, `CallViewModel`, only
/// rings while `MainTabView` is alive in the foreground).
///
/// Deliberately does NOT reimplement call signaling: a VoIP push payload
/// (see `sendApnsVoip` in `src/lib/apns.ts`) carries only
/// `callerId`/`callId`/`callerName`/`callerUsername`/`isVideo` - enough
/// to report a real call to CXProvider immediately, which Apple requires
/// - but never the WebRTC `signal` itself (this app's own security
/// convention: minimal identifiers in a push payload, real content
/// fetched/received afterward - see this task's payload-minimality
/// requirement). The actual SDP arrives the normal way, over
/// `ZrpSocket`'s "incoming-call" event, once this coordinator connects
/// the socket - server.js/socket-authz.js's `pendingFor()` redelivers
/// that event to a reconnecting client if the call is still ringing,
/// which is what makes answering an app-was-terminated call possible at
/// all. `CallViewModel.acceptCall()`/`rejectCall()`/`endCall()` are
/// called directly from here - the one and only signaling
/// implementation this app has, exactly as CallKit is meant to be used
/// (a system UI in front of your own call logic, not a second one).
@MainActor
final class VoipPushCoordinator: NSObject, ObservableObject {

    @Published private(set) var lastVoipTokenHex: String?
    @Published private(set) var lastRegistrationError: String?

    private let repository: PushTokenRepositoryProtocol
    private let provider: CXProvider
    private var pushRegistry: PKPushRegistry?

    private weak var callViewModel: CallViewModel?
    private var isSignedIn: (() -> Bool)?
    private var connectSocket: (() -> Void)?

    /// The CallKit-side identity of the one call this coordinator can
    /// ever be tracking at a time (`maximumCallsPerCallGroup = 1` below)
    /// - `nil` means "no call CallKit knows about right now", which is
    /// exactly what `providerDidReset`/`CXEndCallAction` restore, so a
    /// stale UUID never outlives the call it named (this task's own "no
    /// phantom calls" requirement).
    private var activeCallUUID: UUID?

    init(repository: PushTokenRepositoryProtocol = PushTokenRepository()) {
        self.repository = repository
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.generic]
        self.provider = CXProvider(configuration: configuration)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    /// Called once from `AppDelegate.application(_:didFinishLaunchingWithOptions:)`.
    func startListening() {
        guard pushRegistry == nil else { return }
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        pushRegistry = registry
    }

    /// Called from `ZRPSocialApp`'s launch-time `.task`, once its own
    /// `@StateObject`s exist - see `PushCoordinator.attach` for the
    /// identical two-phase-init reasoning.
    func attach(
        callViewModel: CallViewModel,
        isSignedIn: @escaping () -> Bool,
        connectSocket: @escaping () -> Void
    ) {
        self.callViewModel = callViewModel
        self.isSignedIn = isSignedIn
        self.connectSocket = connectSocket
    }

    // MARK: - VoIP token lifecycle

    // Not private: exercised directly from VoipPushCoordinatorTests
    // (PKPushRegistry itself cannot be driven from XCTest), matching
    // PushCoordinator.didRegisterDeviceToken's identical visibility
    // tradeoff.
    func didUpdateToken(_ tokenData: Data) {
        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
        lastVoipTokenHex = hex
        lastRegistrationError = nil
        guard isSignedIn?() == true else { return }
        Task { await registerPendingTokenIfNeeded() }
    }

    /// Called on sign-in (the reverse ordering from `didUpdateToken`'s
    /// own early-return: the VoIP token arrived first, while signed
    /// out) - see `PushCoordinator.registerPendingTokenIfNeeded()`'s
    /// identical reasoning. Safe to call more than once for the same
    /// token: registration is an idempotent upsert server-side.
    func registerPendingTokenIfNeeded() async {
        guard let hex = lastVoipTokenHex else { return }
        do { try await repository.registerVoipToken(hex) }
        catch {
            lastRegistrationError = error.localizedDescription
            ZrpLog.error("Failed to register VoIP token: \(error)")
        }
    }

    private func didInvalidateToken() {
        guard let hex = lastVoipTokenHex else { return }
        lastVoipTokenHex = nil
        Task { await unregisterCurrentToken(hex) }
    }

    /// Called by `SessionController.signOut()`/`handleSessionExpired()`
    /// - see `PushCoordinator.unregisterCurrentToken()`'s identical
    /// reasoning.
    func unregisterCurrentToken() async {
        guard let hex = lastVoipTokenHex else { return }
        await unregisterCurrentToken(hex)
    }

    private func unregisterCurrentToken(_ hex: String) async {
        do { try await repository.unregisterVoipToken(hex) }
        catch { ZrpLog.error("Failed to unregister VoIP token: \(error)") }
    }

    // MARK: - Incoming VoIP push -> CallKit

    private func handleIncomingPush(userInfo: [AnyHashable: Any], completion: @escaping () -> Void) {
        guard let payload = VoipPushPayloadParser.parse(userInfo) else {
            // Apple requires reporting SOME call for every VoIP push
            // this app receives, even one it cannot actually act on -
            // an app that doesn't can have its VoIP entitlement revoked.
            // Reported and immediately ended, rather than silently
            // dropped or left ringing forever.
            reportUnusablePush(completion: completion)
            return
        }

        let uuid = UUID()
        activeCallUUID = uuid

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: payload.callerName)
        update.localizedCallerName = payload.callerName
        update.hasVideo = payload.isVideo
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false

        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error {
                ZrpLog.error("CXProvider failed to report incoming call: \(error)")
            }
            completion()
            // Only after CallKit has the call: use the background time
            // this VoIP push grants to connect the socket, so the real
            // "incoming-call" event (with the actual signal) has
            // somewhere to arrive - see this file's own header comment.
            self?.connectSocket?()
        }
    }

    private func reportUnusablePush(completion: @escaping () -> Void) {
        let uuid = UUID()
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Unknown")
        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] _ in
            self?.provider.reportCall(with: uuid, endedAt: nil, reason: .failed)
            completion()
        }
    }

    // MARK: - CallKit actions -> CallViewModel

    /// Waits (bounded) for `CallViewModel` to receive the real
    /// "incoming-call" redelivery - the VoIP push alone never carries
    /// enough to answer with (see this file's header comment). A short
    /// poll rather than a Combine subscription: this coordinator has no
    /// existing reactive-binding infrastructure to `CallViewModel`, and
    /// a bounded 200ms-interval poll is simple enough not to need one
    /// for a one-shot wait like this.
    private func waitForIncomingSignal(timeout: Duration = .seconds(10)) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while ContinuousClock.now < deadline {
            if callViewModel?.phase == .incoming { return true }
            try? await Task.sleep(for: .milliseconds(200))
        }
        return callViewModel?.phase == .incoming
    }

    private func handleAnswer(callUUID: UUID) async -> Bool {
        guard callUUID == activeCallUUID, let callViewModel else { return false }
        let arrived = await waitForIncomingSignal()
        guard arrived, callViewModel.phase == .incoming else { return false }
        callViewModel.acceptCall()
        return true
    }

    private func handleEnd(callUUID: UUID) {
        if callUUID == activeCallUUID, let callViewModel, callViewModel.phase != .idle {
            if callViewModel.phase == .incoming {
                callViewModel.rejectCall(error: nil)
            } else {
                callViewModel.endCall(error: nil)
            }
        }
        if callUUID == activeCallUUID { activeCallUUID = nil }
    }
}

extension VoipPushCoordinator: PKPushRegistryDelegate {

    nonisolated func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }
        let tokenData = pushCredentials.token
        Task { @MainActor in self.didUpdateToken(tokenData) }
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        Task { @MainActor in self.didInvalidateToken() }
    }

    /// The one hard real-time requirement in this whole task: this
    /// method must report a call to CallKit before/very close to when
    /// it returns, or iOS may terminate this app and eventually revoke
    /// its VoIP push entitlement (Apple's PushKit contract, not a ZRP
    /// design choice).
    nonisolated func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }
        let userInfo = payload.dictionaryPayload
        Task { @MainActor in self.handleIncomingPush(userInfo: userInfo, completion: completion) }
    }
}

extension VoipPushCoordinator: CXProviderDelegate {

    nonisolated func providerDidReset(_ provider: CXProvider) {
        Task { @MainActor in self.activeCallUUID = nil }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        Task { @MainActor in
            if await self.handleAnswer(callUUID: action.callUUID) {
                action.fulfill()
            } else {
                action.fail()
                self.activeCallUUID = nil
            }
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        Task { @MainActor in
            self.handleEnd(callUUID: action.callUUID)
            action.fulfill()
        }
    }

    // AVAudioSession activation/deactivation for a CallKit-reported call
    // is intentionally left to CallViewModel's own existing
    // configureCallAudioSession()/teardownCallAudioSession() (called
    // from acceptCall()/endCall() exactly as for a non-CallKit call) -
    // not reimplemented here. Known limitation: CallKit's own
    // documented best practice is to defer session activation to this
    // exact callback rather than activating independently: see
    // ios-native/PARITY.md's CallKit section for why that refinement is
    // not done this pass.
    nonisolated func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {}
    nonisolated func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}
