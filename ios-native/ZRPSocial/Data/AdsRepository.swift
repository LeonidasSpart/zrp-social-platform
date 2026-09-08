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
    /// Public: the route serves a signed-out reader too, exactly as the
    /// rest of the feed does, so this does not require auth. It does
    /// still send the session when there is one, which is how the route
    /// knows not to show someone their own campaign.
    func serve() async throws -> SponsoredAd? {
        let response: SponsoredAdResponse = try await client.send(
            Endpoint.get("ads/serve", requiresAuth: false)
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
