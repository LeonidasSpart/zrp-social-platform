import XCTest
@testable import ZRPSocial

/// Captures the single most recent request `ApiClient` sent, and answers
/// it with a scripted response, without touching the network.
///
/// `URLProtocol` registered on a private `URLSession` (never
/// `URLSession.shared`), so this cannot intercept any other test's or the
/// app's own traffic.
final class RecordingURLProtocol: URLProtocol, @unchecked Sendable {

    nonisolated(unsafe) static var lastRequest: URLRequest?
    nonisolated(unsafe) static var lastBody: Data?
    nonisolated(unsafe) static var responseStatus = 200
    nonisolated(unsafe) static var responseBody = Data("{}".utf8)

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        // `URLProtocol` hands the body over as `httpBodyStream` for a
        // request built from `URLRequest.httpBody`, not `httpBody`
        // itself - read whichever is actually present.
        if let body = request.httpBody {
            Self.lastBody = body
        } else if let stream = request.httpBodyStream {
            Self.lastBody = Self.drain(stream)
        } else {
            Self.lastBody = nil
        }

        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: Self.responseStatus,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseBody)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func drain(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 4096
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}

@MainActor
final class AdminRepositoryTests: XCTestCase {

    private func makeClient() -> ApiClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecordingURLProtocol.self]
        let session = URLSession(configuration: configuration)
        return ApiClient(sessionStore: .shared, session: session)
    }

    override func setUp() {
        super.setUp()
        RecordingURLProtocol.lastRequest = nil
        RecordingURLProtocol.lastBody = nil
        RecordingURLProtocol.responseStatus = 200
        RecordingURLProtocol.responseBody = Data("{}".utf8)
    }

    /// The tricky case this whole request type exists for: clearing a
    /// badge must send a literal JSON `null`, not omit the key - see
    /// `AdminRepository.setUserBadge`'s own doc comment on why Swift's
    /// default `Encodable` synthesis would get this wrong.
    func testSetUserBadgeNilEncodesJSONNull() async throws {
        let repository = AdminRepository(client: makeClient())
        try await repository.setUserBadge(id: "u1", badge: nil)

        let body = try XCTUnwrap(RecordingURLProtocol.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertTrue(json.keys.contains("badgeType"), "badgeType key must be present, not omitted")
        XCTAssertTrue(json["badgeType"] is NSNull, "badgeType must encode as JSON null, not be omitted")

        XCTAssertEqual(RecordingURLProtocol.lastRequest?.httpMethod, "PUT")
        XCTAssertEqual(RecordingURLProtocol.lastRequest?.url?.path, "/api/admin/users/u1")
    }

    func testSetUserBadgeValueEncodesString() async throws {
        let repository = AdminRepository(client: makeClient())
        try await repository.setUserBadge(id: "u1", badge: .verified)

        let body = try XCTUnwrap(RecordingURLProtocol.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["badgeType"], "verified")
    }

    func testSetUserRoleSendsExpectedBody() async throws {
        let repository = AdminRepository(client: makeClient())
        try await repository.setUserRole(id: "u1", role: .moderator)

        let body = try XCTUnwrap(RecordingURLProtocol.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["role"], "MODERATOR")
        XCTAssertEqual(RecordingURLProtocol.lastRequest?.httpMethod, "PUT")
    }

    func testDeleteUserSendsDeleteToCorrectPath() async throws {
        let repository = AdminRepository(client: makeClient())
        try await repository.deleteUser(id: "u42")

        XCTAssertEqual(RecordingURLProtocol.lastRequest?.httpMethod, "DELETE")
        XCTAssertEqual(RecordingURLProtocol.lastRequest?.url?.path, "/api/admin/users/u42")
    }

    func testToggleBanDecodesResponse() async throws {
        RecordingURLProtocol.responseBody = Data(#"{"banned":true}"#.utf8)
        let repository = AdminRepository(client: makeClient())

        let banned = try await repository.toggleBan(userId: "u1")

        XCTAssertTrue(banned)
        XCTAssertEqual(RecordingURLProtocol.lastRequest?.httpMethod, "POST")
        XCTAssertEqual(RecordingURLProtocol.lastRequest?.url?.path, "/api/admin/users/u1/ban")
    }

    func testUsersBuildsExpectedQuery() async throws {
        RecordingURLProtocol.responseBody = Data(
            #"{"users":[],"total":0,"page":1,"totalPages":1,"stats":{"total":0,"active":0,"banned":0,"admins":0,"mods":0}}"#.utf8
        )
        let repository = AdminRepository(client: makeClient())

        _ = try await repository.users(
            search: "ali ce",
            page: 2,
            role: .moderator,
            badge: .verified,
            status: .banned
        )

        let url = try XCTUnwrap(RecordingURLProtocol.lastRequest?.url)
        let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: true))
        let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })

        XCTAssertEqual(query["page"], "2")
        XCTAssertEqual(query["role"], "MODERATOR")
        XCTAssertEqual(query["badge"], "verified")
        XCTAssertEqual(query["status"], "BANNED")
        XCTAssertEqual(query["search"], "ali ce")
    }

    /// `PUT /api/admin/reports/{id}` clears `actionType`/`actionNote` on
    /// every status but `.actioned` server-side; the client still sends
    /// them so an empty note is unambiguous, but confirms the happy path
    /// for the "actioned" case specifically, since that's the one where
    /// the values actually matter.
    func testSetReportStatusActionedSendsActionFields() async throws {
        let repository = AdminRepository(client: makeClient())
        try await repository.setReportStatus(
            id: "r1",
            status: .actioned,
            actionType: .banUser,
            actionNote: "repeat offender"
        )

        let body = try XCTUnwrap(RecordingURLProtocol.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["status"], "actioned")
        XCTAssertEqual(json["actionType"], "BAN_USER")
        XCTAssertEqual(json["actionNote"], "repeat offender")
    }

    func testResolveAppealSendsDecisionAndNote() async throws {
        let repository = AdminRepository(client: makeClient())
        try await repository.resolveAppeal(id: "a1", decision: .overturned, resolutionNote: "clear mistake")

        let body = try XCTUnwrap(RecordingURLProtocol.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["status"], "overturned")
        XCTAssertEqual(json["resolutionNote"], "clear mistake")
        XCTAssertEqual(RecordingURLProtocol.lastRequest?.url?.path, "/api/admin/appeals/a1")
    }

    func testDeletePostSendsDeleteToCorrectPath() async throws {
        let repository = AdminRepository(client: makeClient())
        try await repository.deletePost(id: "p9")

        XCTAssertEqual(RecordingURLProtocol.lastRequest?.httpMethod, "DELETE")
        XCTAssertEqual(RecordingURLProtocol.lastRequest?.url?.path, "/api/admin/posts/p9")
    }
}
