import Foundation
@testable import ZRPSocial

/// Small builders for the admin models' many-field memberwise
/// initializers, so each test only states the fields it actually varies.
///
/// Built with the types' own (compiler-synthesized) memberwise
/// initializers, exposed to this target by `@testable import` - not by
/// decoding JSON, which would just be testing the decoder a second time
/// for no benefit here.
enum AdminFixtures {

    static let fixedDate = Date(timeIntervalSince1970: 1_700_000_000)

    static func actor(id: String = "u1", username: String = "alice", name: String? = nil) -> AdminActorRef {
        AdminActorRef(id: id, username: username, name: name)
    }

    static func user(
        id: String = "u1",
        username: String = "alice",
        role: String = "USER",
        badgeType: String? = nil,
        banned: Bool = false
    ) -> AdminUserSummary {
        AdminUserSummary(
            id: id,
            username: username,
            name: nil,
            email: "\(username)@example.com",
            createdAt: fixedDate,
            isAdmin: role == "ADMIN",
            role: role,
            badgeType: badgeType,
            plan: "free",
            banned: banned,
            counts: AdminUserCounts(posts: 1, comments: 2, reports: 0)
        )
    }

    static func report(
        id: String = "r1",
        status: String = "pending",
        reason: String = "spam",
        actionType: String? = nil
    ) -> AdminReport {
        AdminReport(
            id: id,
            reporter: actor(id: "u2", username: "bob"),
            reason: reason,
            details: nil,
            status: status,
            createdAt: fixedDate,
            actionType: actionType,
            actionNote: nil,
            actionedAt: nil,
            post: AdminReportedPost(
                id: "p1",
                content: "hello",
                imageUrl: nil,
                type: "POST",
                author: actor(),
                createdAt: fixedDate
            ),
            comment: nil,
            listing: nil,
            challenge: nil,
            opportunity: nil,
            campaign: nil,
            reportedUser: nil
        )
    }

    /// A report whose only target is a bare-profile report - no post,
    /// comment, listing, challenge, opportunity or campaign attached.
    static func bareProfileReport(id: String = "r2", reportedUsername: String = "carol") -> AdminReport {
        AdminReport(
            id: id,
            reporter: actor(id: "u2", username: "bob"),
            reason: "harassment",
            details: nil,
            status: "pending",
            createdAt: fixedDate,
            actionType: nil,
            actionNote: nil,
            actionedAt: nil,
            post: nil,
            comment: nil,
            listing: nil,
            challenge: nil,
            opportunity: nil,
            campaign: nil,
            reportedUser: actor(id: "u3", username: reportedUsername)
        )
    }

    static func appeal(id: String = "a1", status: String = "pending", reportActionType: String? = "BAN_USER") -> AdminAppeal {
        AdminAppeal(
            id: id,
            user: actor(),
            report: AdminAppealReportRef(
                id: "r1",
                reason: "spam",
                actionType: reportActionType,
                actionNote: nil,
                actionedAt: nil
            ),
            message: "please review",
            status: status,
            resolutionNote: nil,
            resolvedByUsername: nil,
            resolvedAt: nil,
            createdAt: fixedDate
        )
    }

    static func post(id: String = "p1", content: String = "hello") -> AdminPost {
        AdminPost(
            id: id,
            content: content,
            imageUrl: nil,
            imageUrls: [],
            type: "POST",
            status: "published",
            createdAt: fixedDate,
            author: actor(),
            counts: AdminPostCounts(likes: 0, comments: 0, reposts: 0)
        )
    }
}
