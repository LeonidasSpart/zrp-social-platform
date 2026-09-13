import Foundation

protocol ListsRepositoryProtocol: Sendable {
    func myLists() async throws -> [UserListSummary]
    func createList(_ request: CreateUserListRequest) async throws -> UserListSummary
    func list(id: String) async throws -> UserListDetailResponse
    func deleteList(id: String) async throws
    func addMember(id: String, username: String) async throws -> AddListMemberResponse
    func removeMember(id: String, userId: String) async throws
    func feed(id: String, cursor: String?) async throws -> PostsPage
}

/// Twitter/X-style curated lists - entirely new on iOS, backed by
/// prisma/schema.prisma's List/ListMember models.
struct ListsRepository: ListsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func myLists() async throws -> [UserListSummary] {
        struct Page: Decodable { let items: [UserListSummary] }
        let page: Page = try await client.send(Endpoint.get("lists"))
        return page.items
    }

    func createList(_ request: CreateUserListRequest) async throws -> UserListSummary {
        let response: CreateUserListResponse = try await client.send(
            try Endpoint.post("lists", body: request)
        )
        return response.list
    }

    func list(id: String) async throws -> UserListDetailResponse {
        try await client.send(Endpoint.get("lists/\(Endpoint.segment(id))"))
    }

    func deleteList(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("lists/\(Endpoint.segment(id))"))
    }

    func addMember(id: String, username: String) async throws -> AddListMemberResponse {
        try await client.send(
            try Endpoint.post("lists/\(Endpoint.segment(id))/members", body: AddListMemberRequest(username: username))
        )
    }

    func removeMember(id: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("lists/\(Endpoint.segment(id))/members/\(Endpoint.segment(userId))")
        )
    }

    func feed(id: String, cursor: String?) async throws -> PostsPage {
        try await client.send(
            Endpoint.get("lists/\(Endpoint.segment(id))/feed", query: [("cursor", cursor)])
        )
    }
}
