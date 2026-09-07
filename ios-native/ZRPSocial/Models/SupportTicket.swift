import Foundation

/// A support ticket, as `GET /api/support/tickets` and
/// `GET /api/support/tickets/{id}` return it.
///
/// The list route includes only the most recent reply plus a count; the
/// detail route includes the whole thread. Both decode into this, with
/// the fields the list route omits left optional rather than defaulted -
/// "the list did not say" and "there are none" are different things.
struct SupportTicket: Decodable, Identifiable, Equatable {
    let id: String
    let subject: String
    /// The first message, present on the detail route.
    let message: String?
    let category: SupportCategory
    let status: TicketStatus
    let priority: TicketPriority
    let createdAt: Date
    let replies: [TicketReply]?
    let counts: Counts?

    struct Counts: Decodable, Equatable {
        let replies: Int
    }

    private enum CodingKeys: String, CodingKey {
        case id, subject, message, category, status, priority, createdAt, replies
        case counts = "_count"
    }

    /// How many replies the ticket has, whichever route this came from.
    var replyCount: Int { counts?.replies ?? replies?.count ?? 0 }
}

/// One message on a ticket - from the person who opened it, or from
/// support.
struct TicketReply: Decodable, Identifiable, Equatable {
    struct Author: Decodable, Equatable {
        let username: String
        let avatarUrl: String?
        /// `USER`, or a staff role. Used only to mark a reply as coming
        /// from support; nothing is authorised on it client-side.
        let role: String?
    }

    let id: String
    let message: String
    let createdAt: Date
    /// Support's own notes, which the route only ever returns to staff.
    let isInternal: Bool?
    let user: Author?

    /// Whether this reply came from ZRP rather than the ticket's author.
    /// A display distinction only.
    var isFromSupport: Bool {
        guard let role = user?.role?.uppercased() else { return false }
        return role != "USER"
    }
}

/// The eleven categories `POST /api/support/tickets` accepts. Sending
/// anything else is a 400, so `unknown` is never submitted.
enum SupportCategory: String, Decodable, CaseIterable, Identifiable {
    case general = "GENERAL"
    case account = "ACCOUNT"
    case privacy = "PRIVACY"
    case content = "CONTENT"
    case moderation = "MODERATION"
    case payment = "PAYMENT"
    case monetisation = "MONETISATION"
    case bug = "BUG"
    case featureRequest = "FEATURE_REQUEST"
    case security = "SECURITY"
    case other = "OTHER"
    case unknown

    var id: String { rawValue }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SupportCategory(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .general: return .supportCategoryGeneral
        case .account: return .supportCategoryAccount
        case .privacy: return .supportCategoryPrivacy
        case .content: return .supportCategoryContent
        case .moderation: return .supportCategoryModeration
        case .payment: return .supportCategoryPayment
        case .monetisation: return .supportCategoryMonetisation
        case .bug: return .supportCategoryBug
        case .featureRequest: return .supportCategoryFeatureRequest
        case .security: return .supportCategorySecurity
        case .other: return .supportCategoryOther
        case .unknown: return nil
        }
    }

    /// What the composer offers - never `unknown`, which the route would
    /// reject.
    static var selectable: [SupportCategory] {
        allCases.filter { $0 != .unknown }
    }
}

enum TicketStatus: String, Decodable, Equatable {
    case open = "OPEN"
    case inProgress = "IN_PROGRESS"
    case awaitingReply = "AWAITING_REPLY"
    case resolved = "RESOLVED"
    case closed = "CLOSED"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TicketStatus(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .open: return .supportTicketsStatusOpen
        case .inProgress: return .supportTicketsStatusInProgress
        case .awaitingReply: return .supportTicketsStatusAwaitingReply
        case .resolved: return .supportTicketsStatusResolved
        case .closed: return .supportTicketsStatusClosed
        case .unknown: return nil
        }
    }

    /// A resolved or closed ticket takes no more replies - the reply
    /// route refuses one, so the composer is not offered.
    var acceptsReplies: Bool {
        self != .resolved && self != .closed
    }
}

/// Set by the server from the opener's plan, never chosen by the client.
enum TicketPriority: String, Decodable, Equatable {
    case low = "LOW"
    case normal = "NORMAL"
    case high = "HIGH"
    case urgent = "URGENT"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TicketPriority(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .low: return .supportTicketDetailPriorityLow
        case .normal: return .supportTicketDetailPriorityNormal
        case .high: return .supportTicketDetailPriorityHigh
        case .urgent: return .supportTicketDetailPriorityUrgent
        case .unknown: return nil
        }
    }
}
