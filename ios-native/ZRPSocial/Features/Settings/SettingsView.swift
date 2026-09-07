import SwiftUI

/// The settings hub.
///
/// Deliberately does **not** include plan, monetisation or wallet
/// sections. Those are purchase-adjacent surfaces on the website, and an
/// iOS app that presented them would be steering people to an external
/// payment flow - App Store rule 3.1.1. They are recorded in PARITY.md as
/// out of scope for the consumer app rather than quietly omitted.
struct SettingsView: View {

    var body: some View {
        List {
            Section {
                NavigationLink(value: Route.editProfile) {
                    Label { Text(.settingsProfile) } icon: { Image(systemName: "person.crop.circle") }
                }
                NavigationLink(value: Route.accountSettings) {
                    Label { Text(.settingsAccountInfo) } icon: { Image(systemName: "at") }
                }
                NavigationLink(value: Route.languagePicker) {
                    Label { Text(.navLanguage) } icon: { Image(systemName: "globe") }
                }
            }

            Section {
                NavigationLink(value: Route.privacySettings) {
                    Label { Text(.settingsPrivacySettings) } icon: { Image(systemName: "hand.raised") }
                }
                NavigationLink(value: Route.emailPreferences) {
                    Label { Text(.iosEmailPrefsTitle) } icon: { Image(systemName: "envelope") }
                }
                NavigationLink(value: Route.changePassword) {
                    Label { Text(.settingsChangePassword) } icon: { Image(systemName: "key") }
                }
            } header: {
                Text(.settingsPrivacyTitle)
            }

            Section {
                NavigationLink(value: Route.blockedUsers) {
                    Label { Text(.settingsBlockedUsers) } icon: { Image(systemName: "nosign") }
                }
                NavigationLink(value: Route.mutedUsers) {
                    Label { Text(.settingsMutedUsers) } icon: { Image(systemName: "speaker.slash") }
                }
            } footer: {
                Text(.settingsPrivacyManageNote)
            }

            Section {
                NavigationLink(value: Route.dataExport) {
                    Label { Text(.settingsExportData) } icon: { Image(systemName: "square.and.arrow.down") }
                }
            } header: {
                Text(.settingsExportDataHeading)
            } footer: {
                Text(.settingsExportDataDesc)
            }

            Section {
                NavigationLink(value: Route.deleteAccount) {
                    Label { Text(.settingsDeleteAccount) } icon: { Image(systemName: "trash") }
                        .foregroundStyle(ZrpColor.red)
                }
            } header: {
                Text(.settingsDangerZone)
            } footer: {
                Text(.settingsDeleteAccountDesc)
            }
        }
        .scrollContentBackground(.hidden)
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.settingsTitle))
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Privacy toggles: `PUT /api/user/privacy`.
struct PrivacySettingsView: View {

    @EnvironmentObject private var session: SessionController

    @State private var settings: PrivacySettings?
    @State private var loadError: ApiError?
    @State private var isSaving = false
    @State private var message: SettingsMessage?

    private let repository = SettingsRepository()
    private let users = UsersRepository()

    var body: some View {
        Group {
            if let settings {
                form(settings)
            } else if let loadError {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.settingsPrivacySettings))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    /// Read from the viewer's own profile, which is where these three
    /// flags actually live. The session's `CurrentUser` does not carry
    /// them, and defaulting to "public" for a private account would show
    /// the wrong state on the one screen where being wrong matters.
    private func load() async {
        guard settings == nil, let username = session.currentUser?.username else { return }
        do {
            let profile = try await users.profile(username: username)
            settings = PrivacySettings(
                publicLikes: profile.publicLikes,
                publicFollowing: profile.publicFollowing,
                isPrivate: profile.isPrivate
            )
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func form(_ current: PrivacySettings) -> some View {
        List {
            Section {
                toggle(
                    isOn: current.isPrivate,
                    title: .settingsPrivateAccount,
                    description: .settingsPrivateAccountDesc
                ) { newValue in
                    save(PrivacySettings(
                        publicLikes: current.publicLikes,
                        publicFollowing: current.publicFollowing,
                        isPrivate: newValue
                    ))
                }
                toggle(
                    isOn: current.publicLikes,
                    title: .settingsPublicLikes,
                    description: .settingsPublicLikesDesc
                ) { newValue in
                    save(PrivacySettings(
                        publicLikes: newValue,
                        publicFollowing: current.publicFollowing,
                        isPrivate: current.isPrivate
                    ))
                }
                toggle(
                    isOn: current.publicFollowing,
                    title: .settingsPublicFollowing,
                    description: .settingsPublicFollowingDesc
                ) { newValue in
                    save(PrivacySettings(
                        publicLikes: current.publicLikes,
                        publicFollowing: newValue,
                        isPrivate: current.isPrivate
                    ))
                }
            } footer: {
                if let message {
                    Text(verbatim: message.text)
                        .foregroundStyle(message.isError ? ZrpColor.red : ZrpColor.green)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .disabled(isSaving)
    }

    private func toggle(
        isOn: Bool,
        title: L10nKey,
        description: L10nKey,
        onChange: @escaping (Bool) -> Void
    ) -> some View {
        Toggle(isOn: Binding(get: { isOn }, set: onChange)) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline)
                Text(description)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .tint(ZrpColor.red)
    }

    /// Saves the whole set, and keeps the server's answer rather than the
    /// optimistic value - the route returns the stored row, so a rejected
    /// or clamped change shows as it really is.
    private func save(_ next: PrivacySettings) {
        let previous = settings
        settings = next
        Task {
            isSaving = true
            defer { isSaving = false }
            do {
                settings = try await repository.updatePrivacy(
                    PrivacyRequest(
                        publicLikes: next.publicLikes,
                        publicFollowing: next.publicFollowing,
                        isPrivate: next.isPrivate
                    )
                )
                message = SettingsMessage(text: L10n.string(.settingsSuccessPrivacyUpdated), isError: false)
            } catch {
                settings = previous
                message = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.settingsErrPrivacyUpdateFailed),
                    isError: true
                )
            }
        }
    }
}

struct SettingsMessage: Equatable {
    let text: String
    let isError: Bool
}

/// `PUT /api/user/password`.
struct ChangePasswordView: View {

    @State private var current = ""
    @State private var newPassword = ""
    @State private var confirmation = ""
    @State private var isSaving = false
    @State private var message: SettingsMessage?

    private let repository = SettingsRepository()

    var body: some View {
        List {
            Section {
                SecureField(text: $current, prompt: Text(.settingsCurrentPasswordPlaceholder)) {
                    Text(.settingsCurrentPassword)
                }
                SecureField(text: $newPassword, prompt: Text(.settingsNewPasswordPlaceholder)) {
                    Text(.settingsNewPassword)
                }
                SecureField(text: $confirmation, prompt: Text(.settingsConfirmNewPasswordPlaceholder)) {
                    Text(.settingsConfirmNewPassword)
                }
            } footer: {
                if let message {
                    Text(verbatim: message.text)
                        .foregroundStyle(message.isError ? ZrpColor.red : ZrpColor.green)
                }
            }

            Section {
                Button { save() } label: {
                    Text(isSaving ? L10nKey.settingsUpdating : L10nKey.settingsChangePassword)
                        .frame(maxWidth: .infinity)
                }
                .disabled(isSaving)
            }
        }
        .scrollContentBackground(.hidden)
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.settingsChangePasswordTitle))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save() {
        // Checked here as well as server-side, so a mistyped confirmation
        // costs no round trip and no password change.
        guard !current.isEmpty, !newPassword.isEmpty, !confirmation.isEmpty else {
            message = SettingsMessage(text: L10n.string(.settingsErrPasswordFieldsRequired), isError: true)
            return
        }
        guard newPassword.count >= 6 else {
            message = SettingsMessage(text: L10n.string(.settingsErrPasswordMinLength), isError: true)
            return
        }
        guard newPassword == confirmation else {
            message = SettingsMessage(text: L10n.string(.settingsErrPasswordsMismatch), isError: true)
            return
        }

        Task {
            isSaving = true
            defer { isSaving = false }
            do {
                try await repository.changePassword(current: current, new: newPassword)
                // Cleared on success so the entered secrets do not sit in
                // view state any longer than the request needs them.
                current = ""
                newPassword = ""
                confirmation = ""
                message = SettingsMessage(text: L10n.string(.settingsSuccessPasswordUpdated), isError: false)
            } catch {
                message = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.settingsErrPasswordUpdateFailed),
                    isError: true
                )
            }
        }
    }
}
