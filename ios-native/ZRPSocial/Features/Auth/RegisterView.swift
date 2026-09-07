import SwiftUI

/// Create an account.
///
/// Two things about this flow are decided by the backend and stated here
/// rather than smoothed over:
///
/// 1. **Registering does not sign you in.** The route creates the
///    account, emails a verification link, and returns a message - no
///    session. So this ends on a "check your email" screen, not on the
///    timeline.
/// 2. **Logging in is refused until that link is opened** (403 from
///    `verifyCredentials`). Pretending otherwise would send someone to a
///    sign-in that cannot succeed yet.
@MainActor
final class RegisterViewModel: ObservableObject {

    @Published var name = ""
    @Published var username = ""
    @Published var email = ""
    @Published var password = ""

    @Published private(set) var availability: UsernameAvailability?
    @Published private(set) var isCheckingUsername = false
    @Published private(set) var isSubmitting = false
    @Published var errorText: String?
    @Published private(set) var registeredEmail: String?

    private var usernameTask: Task<Void, Never>?
    private let repository: AuthRepositoryProtocol

    init(repository: AuthRepositoryProtocol = AuthRepository()) {
        self.repository = repository
    }

    /// The route's own rules, checked here so the button is only enabled
    /// for input the server can actually accept. It re-validates all of
    /// it regardless - this is a courtesy, not the gate.
    var canSubmit: Bool {
        !isSubmitting
            && username.count >= 3
            && email.contains("@")
            && password.count >= 6
            && availability?.available != false
    }

    /// Debounced, and cancelled when superseded, so an earlier answer
    /// cannot land after a later one and mislabel a name as taken.
    func usernameChanged() {
        availability = nil
        usernameTask?.cancel()
        let candidate = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard candidate.count >= 3 else { return }

        usernameTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled, let self else { return }
            isCheckingUsername = true
            defer { isCheckingUsername = false }
            let result = try? await repository.checkUsername(candidate)
            guard !Task.isCancelled else { return }
            availability = result
        }
    }

    func submit() async {
        errorText = nil
        isSubmitting = true
        defer { isSubmitting = false }

        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await repository.register(
                RegistrationRequest(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                    email: trimmedEmail,
                    password: password
                )
            )
            registeredEmail = trimmedEmail
        } catch {
            // The route's 400 also names the offending `field`, which is
            // not surfaced separately: its message already says which one
            // ("Email already registered", "Username already taken"), and
            // a taken username is caught live as it is typed. Threading a
            // field name through ApiError for one screen would have been
            // more machinery than the extra clarity is worth.
            errorText = (error as? ApiError)?.serverMessage ?? L10n.string(.authErrTryAgain)
        }
    }
}

struct RegisterView: View {

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = RegisterViewModel()

    var body: some View {
        Group {
            if let email = viewModel.registeredEmail {
                VerificationSentView(email: email)
            } else {
                form
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.authCreateAccount))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Text(.musicStudioCancel) }
            }
        }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(.authJoinCommunity)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)

                field(.authFullName, text: $viewModel.name)
                    .textContentType(.name)

                usernameField

                field(.authEmail, text: $viewModel.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    SecureField(text: $viewModel.password, prompt: Text(.authCreatePassword)) {
                        Text(.authCreatePassword)
                    }
                    .textContentType(.newPassword)
                    .padding(ZrpSpacing.md)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                    Text(.authPasswordMinLength)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }

                if let errorText = viewModel.errorText {
                    Text(verbatim: errorText)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button {
                    Task { await viewModel.submit() }
                } label: {
                    Text(viewModel.isSubmitting ? L10nKey.authCreatingAccount : L10nKey.authCreateAccount)
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(viewModel.canSubmit ? ZrpColor.red : ZrpColor.surfaceHighest)
                        .foregroundStyle(viewModel.canSubmit ? .white : ZrpColor.onSurfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(!viewModel.canSubmit)

                Button { dismiss() } label: {
                    Text(.authAlreadyHaveAccount)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private var usernameField: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack {
                field(.authUsername, text: $viewModel.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: viewModel.username) { _, _ in viewModel.usernameChanged() }
                if viewModel.isCheckingUsername {
                    ProgressView().tint(ZrpColor.red)
                }
            }

            if let availability = viewModel.availability {
                if availability.invalid {
                    status(.iosAuthUsernameInvalid, color: ZrpColor.onSurfaceMuted)
                } else if availability.available {
                    status(.iosAuthUsernameAvailable, color: ZrpColor.green)
                } else {
                    status(.iosAuthUsernameTaken, color: ZrpColor.red)
                    // The route has already checked these are free, so
                    // tapping one cannot land on another collision.
                    if !availability.suggestions.isEmpty {
                        Text(.iosAuthUsernameSuggestions)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                        HStack(spacing: ZrpSpacing.sm) {
                            ForEach(availability.suggestions, id: \.self) { suggestion in
                                Button {
                                    viewModel.username = suggestion
                                    viewModel.usernameChanged()
                                } label: {
                                    Text(verbatim: suggestion)
                                        .font(.caption.weight(.medium))
                                        .padding(.horizontal, ZrpSpacing.md)
                                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                                        .background(ZrpColor.surfaceHighest)
                                        .foregroundStyle(ZrpColor.onSurface)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
    }

    private func status(_ key: L10nKey, color: Color) -> some View {
        Text(key)
            .font(.caption)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func field(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }
}

/// Shown after a successful registration.
///
/// The account exists but cannot sign in yet, so this says so and offers
/// the one action that helps: send the email again.
struct VerificationSentView: View {

    let email: String

    @State private var isResending = false
    @State private var message: SettingsMessage?

    private let repository = AuthRepository()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Image(systemName: "envelope.badge")
                    .font(.largeTitle)
                    .foregroundStyle(ZrpColor.red)
                    .accessibilityHidden(true)

                Text(.authSignupSuccessTitle)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)

                Text(.authSignupSuccessBody, ["email": email])
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)

                Text(.iosAuthVerifyOnWebNote)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                Text(.authCheckSpam)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                if let message {
                    Text(verbatim: message.text)
                        .font(.footnote)
                        .foregroundStyle(message.isError ? ZrpColor.red : ZrpColor.green)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button { resend() } label: {
                    Text(isResending ? L10nKey.authResendVerificationSending : L10nKey.authResendVerification)
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.surfaceHighest)
                        .foregroundStyle(ZrpColor.onSurface)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(isResending)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private func resend() {
        Task {
            isResending = true
            defer { isResending = false }
            do {
                try await repository.resendVerification(identifier: email)
                message = SettingsMessage(
                    text: L10n.string(.authResendVerificationSuccess),
                    isError: false
                )
            } catch {
                // The route distinguishes "already verified" and "no such
                // account" with its own wording, which is worth showing.
                message = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.authResendVerificationError),
                    isError: true
                )
            }
        }
    }
}
