import Foundation

/// Everything that can go wrong talking to the ZRP API, in the shape the
/// UI actually needs to branch on.
///
/// Every ZRP route that rejects a request answers with `{"error": "..."}`,
/// and a handful (profile update, onboarding-complete, and the others that
/// resolve a session user) add a machine-readable `code` alongside it -
/// `ACCOUNT_NOT_FOUND` for a session whose underlying `User` row is gone,
/// `NATIVE_PAYMENT_DISABLED` for a store-restricted payment route. Both are
/// surfaced here so a caller can show the server's own specific message
/// (a plan limit, a rate limit, a validation failure) instead of a bare
/// HTTP status.
enum ApiError: Error, Equatable {

    /// The device could not reach the API at all.
    case offline

    /// The request was cancelled - a superseded search, a view that went
    /// away mid-load. Callers generally swallow this rather than showing
    /// an error.
    case cancelled

    /// HTTP 401. The session token is missing, expired, or no longer
    /// valid. `ApiClient` clears stored credentials before this surfaces.
    case unauthorized

    /// HTTP 403.
    case forbidden(message: String?, code: String?)

    /// HTTP 404.
    case notFound(message: String?)

    /// HTTP 429, with the server's own message where it gave one.
    case rateLimited(message: String?)

    /// Any other non-2xx response.
    case server(status: Int, message: String?, code: String?)

    /// A 2xx response whose body did not match the expected shape. This
    /// is a real bug (a contract drift), not a user-facing condition -
    /// it is kept distinct so it is never mistaken for a network blip.
    case decoding(underlying: String)

    /// A transport failure that is not simply being offline.
    case transport(underlying: String)
}

extension ApiError {
    /// The server's own message when there is one, else `nil`. Views
    /// prefer this over inventing their own copy, because the backend's
    /// message is usually far more specific ("You have reached your
    /// plan's daily post limit") than anything the client could guess.
    var serverMessage: String? {
        switch self {
        case .forbidden(let message, _),
             .notFound(let message),
             .rateLimited(let message),
             .server(_, let message, _):
            return message
        case .offline, .cancelled, .unauthorized, .decoding, .transport:
            return nil
        }
    }

    /// The machine-readable `code` field, for callers that must branch on
    /// a specific server condition rather than display a message.
    var serverCode: String? {
        switch self {
        case .forbidden(_, let code), .server(_, _, let code):
            return code
        default:
            return nil
        }
    }

    /// Copy to put in front of the user. Falls back to the server's own
    /// message, then to generic localized text - never to a raw Swift
    /// error description, which leaks implementation detail into the UI.
    var userFacingMessage: String {
        switch self {
        case .offline:
            return L10n.string(.feedOffline)
        case .unauthorized:
            return L10n.string(.authErrSessionExpired)
        case .cancelled:
            return L10n.string(.authErrTryAgain)
        default:
            return serverMessage ?? L10n.string(.authErrTryAgain)
        }
    }

    /// Whether offering a retry button makes sense. Retrying a 403 or a
    /// 404 just fails again.
    var isRetryable: Bool {
        switch self {
        case .offline, .transport, .rateLimited, .cancelled:
            return true
        case .server(let status, _, _):
            return status >= 500
        case .unauthorized, .forbidden, .notFound, .decoding:
            return false
        }
    }
}

/// The `{error, code}` body every failing ZRP route returns.
struct ApiErrorBody: Decodable {
    let error: String?
    let code: String?
}
