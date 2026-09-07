import SwiftUI

/// Username and email.
///
/// Both are constrained in ways worth surfacing before someone types
/// rather than after the server refuses:
///
/// - a username can change **once every 30 days**, and the route reports
///   how many days remain
/// - changing an email requires the current password and does **not**
///   take effect immediately - a verification link goes to the new
///   address and the switch happens when it is opened
struct AccountSettingsView: View {

    @EnvironmentObject private var session: SessionController

    @State private var status: UsernameStatus?
    @State private var loadError: ApiError?
    @State private var newUsername = ""
    @State private var isSavingUsername = false
    @State private var usernameMessage: SettingsMessage?

    @State private var currentPassword = ""
    @State private var newEmail = ""
    @State private var isSendingEmail = false
    @State private var emailMessage: SettingsMessage?

    private let users = UsersRepository()

    private var canChangeUsername: Bool {
        guard let status, status.canChange else { return false }
        let candidate = newUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isSavingUsername
            && candidate.count >= 3
            && candidate.lowercased() != status.username.lowercased()
    }

    private var canChangeEmail: Bool {
        !isSendingEmail && !currentPassword.isEmpty && newEmail.contains("@")
    }

    var body: some View {
        Group {
            if let status {
                form(status)
            } else if let loadError {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.settingsAccountInfo))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            status = try await users.usernameStatus()
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func form(_ status: UsernameStatus) -> some View {
        List {
            Section {
                LabeledContent {
                    Text(verbatim: status.username)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } label: {
                    Text(.settingsCurrentUsername)
                }

                if status.canChange {
                    TextField(
                        text: $newUsername,
                        prompt: Text(.settingsNewUsernamePlaceholder),
                        label: { Text(.settingsNewUsername) }
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                    Button { changeUsername() } label: {
                        Text(isSavingUsername ? L10nKey.settingsSaving : L10nKey.settingsChangeUsername)
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(!canChangeUsername)
                } else {
                    // Stated up front. Letting someone type a new name
                    // and then be refused is the worse version of this.
                    Text(.settingsCooldownNote, ["n": CountFormatting.exact(status.cooldownDays)])
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            } header: {
                Text(.settingsUsernameTitle)
            } footer: {
                if let usernameMessage {
                    Text(verbatim: usernameMessage.text)
                        .foregroundStyle(usernameMessage.isError ? ZrpColor.red : ZrpColor.green)
                } else {
                    Text(.settingsUsernameHint)
                }
            }

            Section {
                SecureField(
                    text: $currentPassword,
                    prompt: Text(.settingsCurrentPasswordPlaceholder)
                ) {
                    Text(.settingsCurrentPassword)
                }

                TextField(
                    text: $newEmail,
                    prompt: Text(.settingsNewEmailPlaceholder),
                    label: { Text(.settingsNewEmail) }
                )
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

                Button { changeEmail() } label: {
                    Text(isSendingEmail ? L10nKey.settingsSending : L10nKey.settingsSendVerificationEmail)
                        .frame(maxWidth: .infinity)
                }
                .disabled(!canChangeEmail)
            } header: {
                Text(.settingsChangeEmail)
            } footer: {
                if let emailMessage {
                    Text(verbatim: emailMessage.text)
                        .foregroundStyle(emailMessage.isError ? ZrpColor.red : ZrpColor.green)
                } else {
                    Text(.settingsEmailVerifyNote)
                }
            }
        }
        .scrollContentBackground(.hidden)
    }

    private func changeUsername() {
        let candidate = newUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            isSavingUsername = true
            defer { isSavingUsername = false }
            do {
                try await users.changeUsername(candidate)
                newUsername = ""
                usernameMessage = SettingsMessage(
                    text: L10n.string(.settingsSuccessUsernameUpdated),
                    isError: false
                )
                // The username is part of the session's identity, and the
                // cooldown has just reset - both come from the server.
                await load()
                await session.restore()
            } catch {
                usernameMessage = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.settingsErrUsernameUpdateFailed),
                    isError: true
                )
            }
        }
    }

    private func changeEmail() {
        Task {
            isSendingEmail = true
            defer { isSendingEmail = false }
            do {
                try await users.changeEmail(
                    currentPassword: currentPassword,
                    newEmail: newEmail.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                // Cleared immediately: the password has served its
                // purpose and should not linger in view state.
                currentPassword = ""
                emailMessage = SettingsMessage(
                    text: L10n.string(.settingsEmailVerifyNote),
                    isError: false
                )
            } catch {
                emailMessage = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.settingsErrSomethingWrong),
                    isError: true
                )
            }
        }
    }
}
