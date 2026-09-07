import Foundation

/// A poll attached to a post.
///
/// Two routes send it in two shapes, and both are decoded here:
/// `GET /api/posts/{id}` folds the viewer's own vote into `userVote` and
/// drops the rows, while `GET /api/posts?tab=following` sends the raw
/// `votes_user` array (already filtered server-side to the viewer). The
/// explore feed does not select polls at all - see the backend
/// limitations section of PARITY.md.
struct Poll: Decodable, Identifiable, Equatable, Hashable {

    let id: String
    let question: String
    let options: [String]

    /// Option index (as a string key, which is what JSON object keys
    /// are) to vote count. Absent until someone has voted.
    let votes: [String: Int]

    let expiresAt: Date?

    /// Which option the viewer chose, or `nil` for "not voted" - which
    /// also covers "signed out", since the rows are filtered by viewer.
    let userVote: Int?

    var totalVotes: Int { votes.values.reduce(0, +) }

    func voteCount(forOption index: Int) -> Int {
        votes["\(index)"] ?? 0
    }

    /// A closed poll takes no more votes: the route refuses one with a
    /// 400 once `expiresAt` has passed.
    var hasEnded: Bool {
        guard let expiresAt else { return false }
        return expiresAt < Date()
    }

    private enum CodingKeys: String, CodingKey {
        case id, question, options, votes, expiresAt, userVote
        case votesUser = "votes_user"
    }

    private struct VoteRow: Decodable {
        let optionIndex: Int
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        question = try container.decode(String.self, forKey: .question)
        options = try container.decodeIfPresent([String].self, forKey: .options) ?? []
        // `votes` is a nullable JSON column: null until the first vote.
        votes = try container.decodeIfPresent([String: Int].self, forKey: .votes) ?? [:]
        expiresAt = try container.decodeIfPresent(Date.self, forKey: .expiresAt)

        if let folded = try container.decodeIfPresent(Int.self, forKey: .userVote) {
            userVote = folded
        } else {
            let rows = try container.decodeIfPresent([VoteRow].self, forKey: .votesUser) ?? []
            userVote = rows.first?.optionIndex
        }
    }
}
