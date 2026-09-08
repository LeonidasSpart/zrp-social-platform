import Foundation

protocol AdsRepositoryProtocol: Sendable {
    func serve() async throws -> SponsoredAd?
    func logImpression(campaignId: String) async
    func logClick(campaignId: String) async -> String?
}

struct AdsRepository: AdsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct CampaignRequest: Encodable {
        let campaignId: String
    }

    /// One eligible ad, or `nil`.
    ///
    /// **Sends the session, and must.** The route serves a signed-out
    /// reader too, so this looked like a `requiresAuth: false` call -
    /// but that flag does not mean "works signed out", it means "do not
    /// attach the cookie at all", and the route reads the caller's
    /// identity for a reason: `advertiserId: { not: viewerId }` is what
    /// stops someone being shown their own ad and spending their own
    /// budget on themselves. Stripping the cookie would defeat that
    /// guard and log every impression as anonymous.
    ///
    /// `requiresAuth: true` is still correct for a signed-out reader:
    /// `ApiClient` attaches the cookie only when a session exists and
    /// sends the request either way, which is exactly what the
    /// website's own same-origin fetch does.
    func serve() async throws -> SponsoredAd? {
        let response: SponsoredAdResponse = try await client.send(
            Endpoint.get("ads/serve")
        )
        return response.ad
    }

    /// Records that the ad was seen.
    ///
    /// Deliberately cannot throw. An impression is telemetry: the
    /// campaign may have been paused or exhausted between being served
    /// and being seen, in which case the route answers `{logged: false}`
    /// rather than an error, and there is nothing for a reader to do
    /// about either outcome. The website swallows this too
    /// (`.catch(() => {})`).
    func logImpression(campaignId: String) async {
        try? await client.sendIgnoringResponse(
            try Endpoint.post("ads/impression", body: CampaignRequest(campaignId: campaignId))
        )
    }

    /// Records the click and returns where to go next.
    ///
    /// `nil` when the route declined to log it - a campaign that stopped
    /// being ACTIVE in the meantime. The caller falls back to the post
    /// itself, which is what the route would have returned anyway for an
    /// advertiser who set no external destination.
    func logClick(campaignId: String) async -> String? {
        let response: AdClickResponse? = try? await client.send(
            try Endpoint.post("ads/click", body: CampaignRequest(campaignId: campaignId))
        )
        return response?.redirectUrl
    }
}
