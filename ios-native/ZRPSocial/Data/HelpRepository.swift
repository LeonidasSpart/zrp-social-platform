import Foundation

protocol HelpRepositoryProtocol: Sendable {
    func campaigns(
        category: HelpCategory?,
        needType: HelpNeedType?,
        cursor: String?
    ) async throws -> HelpCampaignsPage
    func campaign(id: String) async throws -> HelpCampaign
    func offerHelp(campaignId: String, needType: HelpNeedType, message: String) async throws
}

struct HelpRepository: HelpRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct OfferRequest: Encodable {
        let needType: String
        let message: String
    }

    /// `GET /api/help` - active campaigns, cursor-paginated, optionally
    /// filtered by category and by the kind of help wanted. Public.
    func campaigns(
        category: HelpCategory?,
        needType: HelpNeedType?,
        cursor: String?
    ) async throws -> HelpCampaignsPage {
        try await client.send(
            Endpoint.get(
                "help",
                query: [
                    ("category", category.flatMap { $0 == .unknown ? nil : $0.rawValue }),
                    ("needType", needType.flatMap { $0 == .unknown ? nil : $0.rawValue }),
                    ("cursor", cursor),
                ],
                requiresAuth: false
            )
        )
    }

    /// `GET /api/help/{id}`. Reading it is also what counts a view,
    /// server-side, for anyone who is not the organiser.
    func campaign(id: String) async throws -> HelpCampaign {
        struct Response: Decodable {
            let campaign: HelpCampaign
        }
        let response: Response = try await client.send(
            Endpoint.get("help/\(Endpoint.segment(id))", requiresAuth: false)
        )
        return response.campaign
    }

    /// `POST /api/help/{id}/offer` - offering supplies, skills or time.
    ///
    /// The route accepts only those three; `MONEY` is refused there and
    /// belongs to `/contribute`, which native clients are blocked from by
    /// store policy.
    func offerHelp(
        campaignId: String,
        needType: HelpNeedType,
        message: String
    ) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "help/\(Endpoint.segment(campaignId))/offer",
                body: OfferRequest(
                    needType: needType.rawValue,
                    message: message.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            )
        )
    }
}
