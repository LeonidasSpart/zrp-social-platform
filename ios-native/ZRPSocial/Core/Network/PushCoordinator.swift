import Foundation
import UIKit
import UserNotifications

/// Owns this device's ordinary (non-VoIP) push-notification state:
/// permission status, the raw APNs device token once granted, and
/// routing a tapped notification into the app's existing deep-link
/// queue. The separate PushKit VoIP token and CallKit reporting live in
/// `VoipPushCoordinator` - the two are independent Apple subscriptions
/// (see `PushTokenRepository`'s own doc comment) and are kept apart
/// here too.
///
/// One instance, owned by `AppDelegate` and constructed before
/// `application(_:didFinishLaunchingWithOptions:)` runs, since
/// `UNUserNotificationCenter.current().delegate` must already point at
/// something by the time that method returns - otherwise a notification
/// tap that *launches* the app from Terminated never reaches
/// `didReceive response` and this app would fall back to opening plain
/// Home, exactly what section 6 of this task forbids. `attach(deepLinks:isSignedIn:)`
/// wires in the two dependencies only SwiftUI's environment can provide,
/// once the app's `@StateObject`s exist - see `ZRPSocialApp.swift`.
@MainActor
final class PushCoordinator: NSObject, ObservableObject {

    /// Mirrors `UNAuthorizationStatus` 1:1 so the permission UI can
    /// switch over it without importing UserNotifications itself.
    enum PermissionState: Equatable {
        case notDetermined
        case authorized
        case provisional
        case denied
        case restricted
    }

    @Published private(set) var permissionState: PermissionState = .notDetermined
    @Published private(set) var lastRegistrationError: String?

    /// Set once `didRegisterForRemoteNotificationsWithDeviceToken` fires.
    /// Sent to the backend immediately if signed in; otherwise held here
    /// until `attach`/a later sign-in supplies `isSignedIn() == true` -
    /// covers both possible orderings of "token arrives" vs "user signs
    /// in" (a signed-out launch still registers for remote notifications
    /// so a token is ready the moment sign-in completes).
    private(set) var pendingDeviceTokenHex: String?

    private let repository: PushTokenRepositoryProtocol
    private var deepLinks: DeepLinkInbox?
    private var isSignedIn: (() -> Bool)?
    private var pendingRouteUserInfo: [AnyHashable: Any]?

    init(repository: PushTokenRepositoryProtocol = PushTokenRepository()) {
        self.repository = repository
        super.init()
    }

    /// Called once from `ZRPSocialApp`'s launch-time `.task`, after its
    /// `@StateObject`s exist. Flushes anything that arrived before this
    /// point (a device token, or - launched-from-Terminated - a tap that
    /// was already routed and is waiting for somewhere to deliver it).
    func attach(deepLinks: DeepLinkInbox, isSignedIn: @escaping () -> Bool) {
        self.deepLinks = deepLinks
        self.isSignedIn = isSignedIn

        if let pendingRouteUserInfo {
            self.pendingRouteUserInfo = nil
            route(userInfo: pendingRouteUserInfo)
        }

        Task {
            await refreshPermissionState()
            // Safe and expected to call every launch when already
            // authorized - this is a token refresh, not a re-prompt.
            // requestAuthorization() below is the only path that ever
            // shows the system dialog.
            if permissionState == .authorized || permissionState == .provisional {
                UIApplication.shared.registerForRemoteNotifications()
            }
            if isSignedIn() {
                await registerPendingTokenIfNeeded()
            }
        }
    }

    // MARK: - Permission

    func refreshPermissionState() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permissionState = Self.map(settings.authorizationStatus)
    }

    /// Requests permission. Callers (the permission UI) must check
    /// `permissionState == .notDetermined` first - iOS itself silently
    /// no-ops a repeat request once the user has answered, denied or
    /// granted, so calling this again would look like nothing happened
    /// rather than genuinely re-asking.
    func requestAuthorization() async {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            await refreshPermissionState()
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
        } catch {
            ZrpLog.error("Notification authorization request failed: \(error)")
            await refreshPermissionState()
        }
    }

    private static func map(_ status: UNAuthorizationStatus) -> PermissionState {
        switch status {
        case .notDetermined: return .notDetermined
        case .authorized: return .authorized
        case .provisional: return .provisional
        case .denied: return .denied
        case .ephemeral: return .authorized // App Clips only.
        case .restricted: return .restricted
        @unknown default: return .denied
        }
    }

    // MARK: - Device token lifecycle

    func didRegisterDeviceToken(_ tokenData: Data) {
        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
        pendingDeviceTokenHex = hex
        lastRegistrationError = nil
        guard isSignedIn?() == true else { return }
        Task { await registerPendingTokenIfNeeded() }
    }

    /// Never silently ignored (see this task's own token-lifecycle
    /// requirement): always logged, and surfaced on `@Published` so a
    /// future diagnostics/settings screen can show it.
    func didFailToRegister(_ error: Error) {
        lastRegistrationError = error.localizedDescription
        ZrpLog.error("APNs registration failed: \(error)")
    }

    /// Called here on attach/sign-in, and by `SessionController` on
    /// every fresh sign-in - registration is an idempotent upsert
    /// server-side (keyed on the token itself), so calling it more than
    /// once for the same token is always safe.
    func registerPendingTokenIfNeeded() async {
        guard let hex = pendingDeviceTokenHex else { return }
        do {
            try await repository.registerAlertToken(hex)
        } catch {
            ZrpLog.error("Failed to register push token with backend: \(error)")
        }
    }

    /// Called by `SessionController.signOut()`/`handleSessionExpired()`
    /// before the session is actually cleared, matching Android's
    /// unregister-before-clear ordering (an unregister call made after
    /// sign-out would itself 401).
    func unregisterCurrentToken() async {
        guard let hex = pendingDeviceTokenHex else { return }
        do {
            try await repository.unregisterAlertToken(hex)
        } catch {
            ZrpLog.error("Failed to unregister push token with backend: \(error)")
        }
    }

    // MARK: - Foreground presentation

    /// While the app is active, Socket.IO's realtime handlers already
    /// update the relevant screen live - a system banner on top of that
    /// would be a duplicate notification for the one thing the user is
    /// already looking at (CLAUDE.md/this task: "Socket.IO and APNs must
    /// complement each other. Do not replace Socket.IO realtime with
    /// push."). Badge and sound still fire, since those reflect real
    /// state (unread count, an audible cue) that a foregrounded screen
    /// doesn't otherwise announce.
    func presentationOptions(for notification: UNNotification) -> UNNotificationPresentationOptions {
        [.badge, .sound]
    }

    // MARK: - Notification tap routing

    /// Routes a tapped notification through the app's one existing
    /// universal-link queue (`DeepLinkInbox` / `DeepLink.target(for:)`) -
    /// not a second router. `userInfo["url"]` is the same relative path
    /// every push payload already carries (`sendPushNotification`'s
    /// `url` parameter - identical contract across Android's FCM push,
    /// Web Push, and this app's own `src/lib/apns.ts`). A payload with
    /// no recognizable url safely does nothing, rather than crashing or
    /// forcing a blind Home-screen open (this task's own requirement).
    func route(userInfo: [AnyHashable: Any]) {
        guard let deepLinks else {
            // Arrived before `attach` (e.g. a terminated-launch tap
            // racing SwiftUI's own startup) - held for attach() to
            // deliver once the queue exists.
            pendingRouteUserInfo = userInfo
            return
        }
        guard
            let path = userInfo["url"] as? String,
            path.hasPrefix("/"),
            let url = URL(string: "https://zrp.one" + path)
        else {
            ZrpLog.debug("Push notification tapped with no usable url in payload")
            return
        }
        deepLinks.receive(url)
    }
}
