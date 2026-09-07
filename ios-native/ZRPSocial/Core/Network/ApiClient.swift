import Foundation

/// The single HTTP entry point for the whole app.
///
/// Talks to the same REST API the ZRP website itself calls
/// (`src/app/api/**`) - there is no mobile backend, no gateway, and no
/// parallel contract. Authenticated requests replay the mobile session
/// token as the exact cookie NextAuth's browser session uses, which is
/// what lets every existing route serve a native client unmodified. See
/// `SessionStore` for why that design was chosen, and
/// `src/app/api/mobile/auth/login/route.ts` for the server's own
/// explanation.
///
/// Nothing outside this file constructs a `URLRequest`. Repositories
/// describe *what* they want (`Endpoint`); this decides how it is sent,
/// authenticated, decoded, and how failures are classified.
final class ApiClient: @unchecked Sendable {

    static let shared = ApiClient()

    /// Posted when the server rejects the stored session with a 401. The
    /// session has already been cleared by the time this fires; the app's
    /// root view listens and returns the user to sign-in.
    static let sessionExpiredNotification = Notification.Name("one.zrp.social.sessionExpired")

    /// Production ZRP. The app ships pointing at the live API - the same
    /// one the website and the Android app use.
    private let baseURL = URL(string: "https://zrp.one/api/")!

    private let session: URLSession
    private let sessionStore: SessionStore
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(sessionStore: SessionStore = .shared, session: URLSession? = nil) {
        self.sessionStore = sessionStore

        if let session {
            self.session = session
        } else {
            let configuration = URLSessionConfiguration.default
            configuration.timeoutIntervalForRequest = 30
            configuration.timeoutIntervalForResource = 60
            configuration.waitsForConnectivity = false
            // The app manages the session cookie itself (see
            // `authorizedRequest`). Letting URLSession also keep a cookie
            // jar would mean two sources of truth for who is signed in,
            // and a stale jar entry surviving a sign-out.
            configuration.httpCookieAcceptPolicy = .never
            configuration.httpShouldSetCookies = false
            configuration.urlCache = nil
            self.session = URLSession(configuration: configuration)
        }

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(Self.decodeDate)

        encoder = JSONEncoder()
    }

    // MARK: - Sending

    /// Send a request and decode its JSON body.
    func send<Response: Decodable>(_ endpoint: Endpoint) async throws -> Response {
        let data = try await perform(endpoint)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            // A decode failure on a 2xx means the contract moved. Log the
            // route and the Swift type, never the payload - responses
            // carry other users' content.
            ZrpLog.error("Decode failed for \(endpoint.path) as \(Response.self)")
            throw ApiError.decoding(underlying: String(describing: error))
        }
    }

    /// Send a request to a route that can legitimately answer with a
    /// bare `null` body.
    ///
    /// `GET /api/music/artists?mine=true` returns Prisma's `findUnique`
    /// result directly, so an account with no artist profile gets the
    /// four bytes `null` with a 200. That is a valid answer, not an
    /// error - but `JSONDecoder` cannot decode a top-level `null` into
    /// an `Optional`, so it is recognised here instead of being reported
    /// as a broken contract.
    func sendAllowingNull<Response: Decodable>(_ endpoint: Endpoint) async throws -> Response? {
        let data = try await perform(endpoint)
        let body = String(decoding: data, as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if body.isEmpty || body == "null" { return nil }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            ZrpLog.error("Decode failed for \(endpoint.path) as \(Response.self)")
            throw ApiError.decoding(underlying: String(describing: error))
        }
    }

    /// Send a request whose response is a file rather than an API
    /// envelope.
    ///
    /// `GET /api/settings/export-data` answers with a JSON *document* and
    /// a `Content-Disposition` filename - the thing a browser downloads -
    /// so it is returned as bytes rather than decoded into a model the
    /// app would only re-encode.
    func sendRaw(_ endpoint: Endpoint) async throws -> Data {
        try await perform(endpoint)
    }

    /// Send a request whose response body the caller does not need.
    ///
    /// Deliberately not an overload of `send` - `Data` is itself
    /// `Decodable`, so two same-named methods would be genuinely
    /// ambiguous at any call site that discards the result.
    func sendIgnoringResponse(_ endpoint: Endpoint) async throws {
        _ = try await perform(endpoint)
    }

    private func perform(_ endpoint: Endpoint) async throws -> Data {
        let request = try makeRequest(endpoint)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            ZrpLog.request(method: endpoint.method.rawValue, path: endpoint.path, status: nil)
            switch error.code {
            case .cancelled:
                throw ApiError.cancelled
            case .notConnectedToInternet, .networkConnectionLost,
                 .dataNotAllowed, .internationalRoamingOff:
                throw ApiError.offline
            default:
                throw ApiError.transport(underlying: error.localizedDescription)
            }
        } catch is CancellationError {
            throw ApiError.cancelled
        }

        guard let http = response as? HTTPURLResponse else {
            throw ApiError.transport(underlying: "Non-HTTP response")
        }

        ZrpLog.request(
            method: endpoint.method.rawValue,
            path: endpoint.path,
            status: http.statusCode
        )

        guard (200..<300).contains(http.statusCode) else {
            throw makeError(status: http.statusCode, body: data)
        }
        return data
    }

    // MARK: - Request construction

    private func makeRequest(_ endpoint: Endpoint) throws -> URLRequest {
        // `relativeTo:` against a base ending in "/api/" - so a path of
        // "posts/explore" resolves to https://zrp.one/api/posts/explore.
        // A path must therefore never start with "/", which would reset
        // it to the domain root.
        guard var components = URLComponents(
            url: URL(string: endpoint.path, relativeTo: baseURL) ?? baseURL,
            resolvingAgainstBaseURL: true
        ) else {
            throw ApiError.transport(underlying: "Malformed path \(endpoint.path)")
        }

        let queryItems = endpoint.query.compactMap { name, value -> URLQueryItem? in
            guard let value else { return nil }
            return URLQueryItem(name: name, value: value)
        }
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw ApiError.transport(underlying: "Malformed URL for \(endpoint.path)")
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Store-policy defence in depth. `src/lib/native-payment-policy.server.ts`
        // rejects requests carrying this header on the four crypto-payment
        // routes (tips, premium-post purchase, plan upgrade, help
        // contribution), which Apple's guideline 3.1.1 does not permit an
        // app to run outside in-app purchase. The app surfaces none of
        // those flows; sending this on every request means that even a
        // future mistake cannot reach them. It is a self-declared signal,
        // never an identity claim - the real boundary stays server-side.
        request.setValue("1", forHTTPHeaderField: "x-zrp-native-app")

        if let body = endpoint.body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if endpoint.requiresAuth, let session = sessionStore.current {
            request.setValue(
                "\(session.cookieName)=\(session.token)",
                forHTTPHeaderField: "Cookie"
            )
        }

        return request
    }

    // MARK: - Error mapping

    private func makeError(status: Int, body: Data) -> ApiError {
        let parsed = try? decoder.decode(ApiErrorBody.self, from: body)
        let message = parsed?.error
        let code = parsed?.code

        switch status {
        case 401:
            // The stored token is no longer accepted. Clear it here
            // rather than leaving every caller to remember to, then let
            // the root view react.
            sessionStore.clear()
            NotificationCenter.default.post(name: Self.sessionExpiredNotification, object: nil)
            return .unauthorized
        case 403:
            return .forbidden(message: message, code: code)
        case 404:
            return .notFound(message: message)
        case 429:
            return .rateLimited(message: message)
        default:
            return .server(status: status, message: message, code: code)
        }
    }

    // MARK: - Dates

    /// ZRP serialises timestamps with `JSON.stringify(Date)`, i.e.
    /// `2025-01-02T03:04:05.123Z`. A few routes hand back values without
    /// fractional seconds, so both are accepted rather than failing a
    /// whole feed page on one timestamp.
    ///
    /// `Date.ISO8601FormatStyle` rather than a shared
    /// `ISO8601DateFormatter`: the format style is a `Sendable` value
    /// type, so it can be referenced from the `@Sendable` decoding
    /// closure below without the shared-mutable-reference hazard a
    /// formatter instance would carry. Xcode 26 diagnoses that
    /// conversion; Xcode 16 did not.
    private static let fractionalISO8601 = Date.ISO8601FormatStyle(
        includingFractionalSeconds: true
    )

    private static let plainISO8601 = Date.ISO8601FormatStyle(
        includingFractionalSeconds: false
    )

    @Sendable
    private static func decodeDate(_ decoder: any Decoder) throws -> Date {
        let raw = try decoder.singleValueContainer().decode(String.self)
        if let date = try? fractionalISO8601.parse(raw) {
            return date
        }
        if let date = try? plainISO8601.parse(raw) {
            return date
        }
        throw DecodingError.dataCorrupted(
            DecodingError.Context(
                codingPath: decoder.codingPath,
                debugDescription: "Unrecognised ISO-8601 timestamp"
            )
        )
    }
}
