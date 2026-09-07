import SwiftUI

/// Request a password-reset email.
///
/// Only the *request* happens here. `POST /api/auth/forgot-password`
/// emails a link, and the reset is completed through that link on the
/// web - there is no route that accepts a reset code typed into an app,
/// so this does not pretend to offer one.
///
/// The route answers identically whether or not the address has an
/// account, deliberately, so that it cannot be used to discover which
/// addresses are registered. This screen preserves that: the same
/// confirmation shows either way.
struct ForgotPasswordView: View {

    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var isSending = false
    @State private var didSend = false
    @State private var errorText: String?

    private let repository = AuthRepository()

    private var canSend: Bool {
        !isSending && email.contains("@")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(.iosAuthForgotTitle)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)

                Text(.iosAuthForgotBody)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                TextField(text: $email, prompt: Text(.authEmail), label: { Text(.authEmail) })
                    .labelsHidden()
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(ZrpSpacing.md)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                if didSend {
                    Text(.iosAuthForgotSent)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.green)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let errorText {
                    Text(verbatim: errorText)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button { send() } label: {
                    Text(isSending ? L10nKey.authResendVerificationSending : L10nKey.iosAuthForgotSend)
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(canSend ? ZrpColor.red : ZrpColor.surfaceHighest)
                        .foregroundStyle(canSend ? .white : ZrpColor.onSurfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.authForgotPassword))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Text(.musicStudioCancel) }
            }
        }
    }

    private func send() {
        Task {
            isSending = true
            defer { isSending = false }
            do {
                try await repository.requestPasswordReset(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                didSend = true
                errorText = nil
            } catch {
                // Only a genuine failure to reach the route lands here -
                // an unknown address still succeeds, by design.
                errorText = (error as? ApiError)?.serverMessage
                    ?? L10n.string(.authErrTryAgain)
            }
        }
    }
}
