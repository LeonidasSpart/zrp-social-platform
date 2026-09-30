import Foundation
import SwiftUI

@MainActor
final class LoginViewModel: ObservableObject {

    @Published var identifier: String = ""
    @Published var password: String = ""
    @Published private(set) var isSubmitting = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var isVerificationError = false
    @Published private(set) var isResendingVerification = false
    @Published private(set) var resendMessage: String?

    private let repository: AuthRepositoryProtocol

    init(repository: AuthRepositoryProtocol = AuthRepository()) {
        self.repository = repository
    }

    var canSubmit: Bool {
        !isSubmitting
            && !identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
    }

    /// Signs in against the real backend and hands the resulting identity
    /// to the caller. Returns `nil` on failure, having already set
    /// `errorMessage` to the server's own wording where it gave one - a
    /// banned account, a wrong password, and a rate limit all read
    /// differently, and the backend says it better than the client could.
    ///
    /// `verifyCredentials` (`src/lib/auth.ts`) refuses an unverified
    /// account with a message containing "verify" - the same detection
    /// web's own login page uses (`isVerificationError` in
    /// `app/login/page.tsx`) to offer a resend button instead of just
    /// showing the raw error and leaving the reader stuck.
    func submit() async -> CurrentUser? {
        guard canSubmit else { return nil }

        isSubmitting = true
        errorMessage = nil
        isVerificationError = false
        resendMessage = nil
        defer { isSubmitting = false }

        do {
            return try await repository.login(identifier: identifier, password: password)
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            isVerificationError = error.userFacingMessage.localizedCaseInsensitiveContains("verif")
            return nil
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
            return nil
        }
    }

    /// Re-sends the verification email to whatever was just typed into
    /// the identifier field - the same "already have what's needed,
    /// don't ask again" shortcut `AuthRepository.resendVerification`'s
    /// own doc comment anticipates.
    func resendVerification() async {
        guard !isResendingVerification else { return }
        isResendingVerification = true
        resendMessage = nil
        defer { isResendingVerification = false }
        do {
            try await repository.resendVerification(identifier: identifier)
            resendMessage = L10n.string(.authResendVerificationSuccess)
        } catch let error as ApiError {
            resendMessage = error.serverMessage ?? L10n.string(.authResendVerificationError)
        } catch {
            resendMessage = L10n.string(.authResendVerificationError)
        }
    }

    /// Shows a failure that happened outside this form - Sign in with
    /// Apple - in the same banner as a password failure, rather than
    /// giving that button an error surface of its own.
    func showError(_ message: String) {
        errorMessage = message
    }

    func clearError() {
        errorMessage = nil
        isVerificationError = false
        resendMessage = nil
    }
}
