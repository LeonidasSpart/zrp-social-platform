import Foundation

protocol CommunitiesRepositoryProtocol: Sendable {
    func communities(category: CommunityCategory?, search: String?) async throws -> [Community]
    func community(id: String) async throws -> CommunityDetailResponse
    func createCommunity(_ request: CreateCommunityRequest) async throws -> Community
    func join(id: String) async throws -> Bool
    func leave(id: String) async throws -> Bool
    func feed(id: String, cursor: String?) async throws -> PostsPage
}

/// Real, database-backed communities - see prisma/schema.prisma's
/// Community/CommunityMember models. This is the first real
/// Communities feature on iOS; there was no equivalent screen before.
struct CommunitiesRepository: CommunitiesRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func communities(category: CommunityCategory?, search: String?) async throws -> [Community] {
        let page: CommunitiesPage = try await client.send(
            Endpoint.get("communities", query: [
                ("category", category?.rawValue),
                ("search", search?.isEmpty == false ? search : nil),
            ])
        )
        return page.items
    }

    func community(id: String) async throws -> CommunityDetailResponse {
        try await client.send(Endpoint.get("communities/\(Endpoint.segment(id))"))
    }

    func createCommunity(_ request: CreateCommunityRequest) async throws -> Community {
        let response: CreateCommunityResponse = try await client.send(
            try Endpoint.post("communities", body: request)
        )
        return response.community
    }

    func join(id: String) async throws -> Bool {
        let response: CommunityMembershipResponse = try await client.send(
            Endpoint.post("communities/\(Endpoint.segment(id))/join")
        )
        return response.isMember
    }

    func leave(id: String) async throws -> Bool {
        let response: CommunityMembershipResponse = try await client.send(
            Endpoint.post("communities/\(Endpoint.segment(id))/leave")
        )
        return response.isMember
    }

    func feed(id: String, cursor: String?) async throws -> PostsPage {
        try await client.send(
            Endpoint.get("communities/\(Endpoint.segment(id))/feed", query: [("cursor", cursor)])
        )
    }
}
