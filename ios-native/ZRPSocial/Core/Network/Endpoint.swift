import Foundation

/// A description of one API call: what to hit, how, and with what.
///
/// Repositories build these; only `ApiClient` turns one into a
/// `URLRequest`. Keeping the two apart is what stops networking details
/// (headers, cookies, base URL, error mapping) from leaking into feature
/// code, and it makes every route the app depends on greppable in one
/// layer.
///
/// Paths are relative to `https://zrp.one/api/` and must not start with
/// "/" - `Endpoint.path` is resolved against that base, and a leading
/// slash would escape to the domain root.
struct Endpoint {

    enum Method: String {
        case get = "GET"
        case post = "POST"
        case put = "PUT"
        case patch = "PATCH"
        case delete = "DELETE"
    }

    let method: Method
    let path: String
    let query: [(String, String?)]
    let body: Data?
    let requiresAuth: Bool

    private init(
        method: Method,
        path: String,
        query: [(String, String?)] = [],
        body: Data? = nil,
        requiresAuth: Bool = true
    ) {
        self.method = method
        self.path = path
        self.query = query
        self.body = body
        self.requiresAuth = requiresAuth
    }

    static func get(
        _ path: String,
        query: [(String, String?)] = [],
        requiresAuth: Bool = true
    ) -> Endpoint {
        Endpoint(method: .get, path: path, query: query, requiresAuth: requiresAuth)
    }

    static func post(
        _ path: String,
        query: [(String, String?)] = [],
        requiresAuth: Bool = true
    ) -> Endpoint {
        Endpoint(method: .post, path: path, query: query, requiresAuth: requiresAuth)
    }

    static func post<Body: Encodable>(
        _ path: String,
        body: Body,
        query: [(String, String?)] = [],
        requiresAuth: Bool = true
    ) throws -> Endpoint {
        Endpoint(
            method: .post,
            path: path,
            query: query,
            body: try JSONEncoder().encode(body),
            requiresAuth: requiresAuth
        )
    }

    static func put<Body: Encodable>(
        _ path: String,
        body: Body,
        requiresAuth: Bool = true
    ) throws -> Endpoint {
        Endpoint(
            method: .put,
            path: path,
            body: try JSONEncoder().encode(body),
            requiresAuth: requiresAuth
        )
    }

    static func put(_ path: String, requiresAuth: Bool = true) -> Endpoint {
        Endpoint(method: .put, path: path, requiresAuth: requiresAuth)
    }

    static func delete(_ path: String, requiresAuth: Bool = true) -> Endpoint {
        Endpoint(method: .delete, path: path, requiresAuth: requiresAuth)
    }
}
