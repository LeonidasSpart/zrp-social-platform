import UIKit
import UserNotifications

/// The one non-SwiftUI entry point this app needs. A pure SwiftUI `App`
/// has no hook for APNs device-token registration, notification
/// presentation/tap delivery, or (see `VoipPushCoordinator`) PushKit -
/// those are `UIApplicationDelegate`/`UNUserNotificationCenterDelegate`/
/// `PKPushRegistryDelegate` callbacks only. This class intentionally does
/// none of the actual work itself: every method here is a one-line
/// forward into `PushCoordinator`/`VoipPushCoordinator`, which own the
/// real state and are also reachable from SwiftUI via the environment
/// (see `ZRPSocialApp.swift`).
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {

    /// Constructed once, here - not by SwiftUI - since
    /// `UNUserNotificationCenter.current().delegate` must be assigned
    /// before `application(_:didFinishLaunchingWithOptions:)` returns,
    /// and `@UIApplicationDelegateAdaptor` builds this object itself
    /// with no constructor-injection point. `ZRPSocialApp`'s launch-time
    /// `.task` calls `attach(deepLinks:isSignedIn:)` on these once its
    /// own `@StateObject`s exist.
    let pushCoordinator = PushCoordinator()
    let voipPushCoordinator = VoipPushCoordinator()

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Must happen before this method returns: a notification tap
        // that launches the app from Terminated only reaches
        // userNotificationCenter(_:didReceive:) if the delegate is
        // already in place when UIKit hands off the pending response -
        // otherwise this app would fall back to a blind Home-screen
        // open, exactly what this task's terminated-launch requirement
        // forbids.
        UNUserNotificationCenter.current().delegate = self
        voipPushCoordinator.startListening()
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        pushCoordinator.didRegisterDeviceToken(deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        pushCoordinator.didFailToRegister(error)
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {

    /// Foreground delivery - see `PushCoordinator.presentationOptions`'s
    /// own comment on why the banner is suppressed while active.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        pushCoordinator.presentationOptions(for: notification)
    }

    /// Background, terminated-launch, and foreground taps all arrive
    /// here - the one path every ordinary (non-call) notification type
    /// funnels through before this app ever tries to navigate anywhere.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        pushCoordinator.route(userInfo: response.notification.request.content.userInfo)
    }
}
