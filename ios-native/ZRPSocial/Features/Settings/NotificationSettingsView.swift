import SwiftUI
import UIKit

/// Shows this device's real push-notification permission state and the
/// one action available for each of the four states `UNAuthorizationStatus`
/// can actually report (`PushCoordinator.PermissionState` - it has no
/// `.restricted` case, unlike `CNAuthorizationStatus`/`CLAuthorizationStatus`;
/// a device-management restriction on notifications surfaces as `.denied`)
/// - never a second, app-invented
/// notion of "notifications on/off" that could drift from what iOS
/// actually allows.
///
/// `.notDetermined` gets a real `requestAuthorization()` call (the
/// system prompt). Every other state routes to iOS's own Settings app
/// instead of pretending this app can flip the permission itself -
/// `.denied` can only be changed there, and re-calling
/// `requestAuthorization()` on an already-decided permission silently
/// no-ops on iOS, so offering that button again would look like a bug.
struct NotificationSettingsView: View {

    @EnvironmentObject private var pushCoordinator: PushCoordinator

    var body: some View {
        Form {
            Section {
                content
            } footer: {
                if let error = pushCoordinator.lastRegistrationError {
                    Text(verbatim: error)
                }
            }
        }
        .navigationTitle(Text(.iosNotificationsPushSettingsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await pushCoordinator.refreshPermissionState() }
        // The system Settings toggle can change while this screen is
        // backgrounded (the "Open Settings" button below sends the
        // person there directly) - re-check on every return so the
        // status shown here never lags reality.
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            Task { await pushCoordinator.refreshPermissionState() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch pushCoordinator.permissionState {
        case .authorized, .provisional:
            statusRow(
                systemImage: "bell.badge.fill",
                tint: ZrpColor.red,
                title: .iosNotificationsStatusEnabledTitle,
                description: .iosNotificationsStatusEnabledDesc
            )

        case .notDetermined:
            statusRow(
                systemImage: "bell",
                tint: ZrpColor.onSurfaceMuted,
                title: .iosNotificationsStatusNotDeterminedTitle,
                description: .iosNotificationsStatusNotDeterminedDesc
            )
            Button {
                Task { await pushCoordinator.requestAuthorization() }
            } label: {
                Text(.iosNotificationsEnableButton)
            }

        case .denied:
            statusRow(
                systemImage: "bell.slash",
                tint: ZrpColor.onSurfaceMuted,
                title: .iosNotificationsStatusDeniedTitle,
                description: .iosNotificationsStatusDeniedDesc
            )
            openSettingsButton
        }
    }

    private func statusRow(systemImage: String, tint: Color, title: L10nKey, description: L10nKey) -> some View {
        HStack(alignment: .top, spacing: ZrpSpacing.md) {
            Image(systemName: systemImage)
                .foregroundStyle(tint)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(title)
                    .font(.body.weight(.semibold))
                Text(description)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .padding(.vertical, ZrpSpacing.xs)
    }

    private var openSettingsButton: some View {
        Button {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        } label: {
            Text(.iosNotificationsOpenSettingsButton)
        }
    }
}
