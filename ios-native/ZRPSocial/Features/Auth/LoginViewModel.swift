import Foundation
import SwiftUI

@MainActor
final class LoginViewModel: ObservableObject {

    @Published var identifier: String = ""
    @Published var password: String = ""
    @Published private(set) var isSubmitting = false
    @Published private(set) var errorMessage: String?

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
    func submit() async -> CurrentUser? {
        guard canSubmit else { return nil }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            return try await repository.login(identifier: identifier, password: password)
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return nil
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
            return nil
        }
    }

    func clearError() {
        errorMessage = nil
    }
}
