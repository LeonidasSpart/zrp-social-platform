import Foundation

struct AmbassadorApplication: Encodable {
    let countryCode: String
    let cityRegion: String?
    let languages: [String]
    let communityLinks: [String]
    let motivation: String
    let communityDescription: String?
    let audienceSize: Int?

    /// The client's half of a gate that is really enforced server-side.
    ///
    /// `validateApplication` refuses the whole request unless this is
    /// literally `true`, and it stamps the version and timestamp itself
    /// - the client sends neither, so there is nothing here to forge.
    let codeOfConductAccepted: Bool
}

protocol AmbassadorsRepositoryProtocol: Sendable {
    func stats() async throws -> AmbassadorStats
    func countries() async throws -> [AmbassadorCountry]
    func me() async throws -> AmbassadorProfile?
    func apply(_ application: AmbassadorApplication) async throws -> AmbassadorProfile
    func acceptCodeOfConduct() async throws -> AmbassadorProfile
}

struct AmbassadorsRepository: AmbassadorsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/ambassadors/stats` - public, no session read.
    func stats() async throws -> AmbassadorStats {
        try await client.send(Endpoint.get("ambassadors/stats", requiresAuth: false))
    }

    /// `GET /api/ambassadors/countries?lang=…` - public.
    ///
    /// The language parameter is what localises the country names, and
    /// the route validates it against its own supported list, falling
    /// back to English for anything else. Sending the app's active
    /// language rather than the device's means someone who chose Turkish
    /// inside ZRP on an English phone reads Turkish country names, which
    /// is the same rule every formatter in this app follows.
    func countries() async throws -> [AmbassadorCountry] {
        let page: AmbassadorCountriesPage = try await client.send(
            Endpoint.get(
                "ambassadors/countries",
                query: [("lang", String(L10n.activeLanguageCode.prefix(2)))],
                requiresAuth: false
            )
        )
        return page.countries
    }

    private struct MeResponse: Decodable {
        let profile: AmbassadorProfile?
    }

    /// `GET /api/ambassadors/me` -> `{profile}`.
    ///
    /// A null profile is the normal answer for anyone who has not
    /// applied, not an error - so it is returned as `nil` rather than
    /// thrown, and the dashboard renders its real empty state.
    func me() async throws -> AmbassadorProfile? {
        let response: MeResponse = try await client.send(Endpoint.get("ambassadors/me"))
        return response.profile
    }

    private struct ApplyResponse: Decodable {
        let success: Bool
        let profile: AmbassadorProfile?
    }

    /// `POST /api/ambassadors/apply`.
    ///
    /// Creates a **PENDING** application and nothing else. No badge, no
    /// status, no privilege - approval is an admin action on a different
    /// route. The 409 for an existing pending, approved or suspended
    /// application carries its own wording for each case, and it is
    /// shown as written.
    func apply(_ application: AmbassadorApplication) async throws -> AmbassadorProfile {
        let response: ApplyResponse = try await client.send(
            try Endpoint.post("ambassadors/apply", body: application)
        )
        guard let profile = response.profile else {
            throw ApiError.decoding(underlying: "apply returned no profile")
        }
        return profile
    }

    /// `POST /api/ambassadors/accept-code`.
    ///
    /// Takes no body at all: the version and the timestamp are the
    /// server's own, written at the moment of the request.
    func acceptCodeOfConduct() async throws -> AmbassadorProfile {
        let response: ApplyResponse = try await client.send(
            Endpoint.post("ambassadors/accept-code")
        )
        guard let profile = response.profile else {
            throw ApiError.decoding(underlying: "accept-code returned no profile")
        }
        return profile
    }
}
