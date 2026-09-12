import Foundation

/// `GET /api/transparency/moderation` - ZRP's public moderation record.
///
/// Aggregate counts only, by the route's own design: no reporter, no
/// reported user, no post or comment content. Everything here is derived
/// from the existing `Report` and `Appeal` tables, so nothing extra is
/// tracked in order to publish it.
struct ModerationTransparency: Decodable, Equatable {
    let generatedAt: Date
    let totals: Totals
    let byReason: [ReasonCount]
    let byStatus: [StatusCount]
    let byActionType: [ActionCount]

    /// Hours. Nil when no report has ever been actioned - which is
    /// genuinely different from zero and must not be rendered as "0h".
    let medianResolutionHours: Double?

    /// Twelve monthly buckets, oldest first, each `"YYYY-MM"`.
    let series: [MonthPoint]
    let appeals: Appeals

    struct Totals: Decodable, Equatable {
        let allTime: Int
        let last30Days: Int
        let last90Days: Int
    }

    struct ReasonCount: Decodable, Equatable, Identifiable {
        let reason: String
        let count: Int
        var id: String { reason }
    }

    struct StatusCount: Decodable, Equatable, Identifiable {
        let status: String
        let count: Int
        var id: String { status }
    }

    struct ActionCount: Decodable, Equatable, Identifiable {
        let actionType: String
        let count: Int
        var id: String { actionType }
    }

    struct MonthPoint: Decodable, Equatable, Identifiable {
        let month: String
        let received: Int
        let actioned: Int
        var id: String { month }
    }

    struct Appeals: Decodable, Equatable {
        let pending: Int
        let upheld: Int
        let overturned: Int
    }

    /// The count the route reports as `actioned`, which the web page
    /// shows as its "Actions taken" headline figure. Read from
    /// `byStatus` rather than summed from `byActionType`, because the
    /// latter only counts reports that recorded a specific action type
    /// and would quietly undercount.
    var actionedCount: Int {
        byStatus.first { $0.status == "actioned" }?.count ?? 0
    }
}

/// The route's taxonomy values, mapped to the strings the web page uses
/// for exactly the same values.
///
/// Reusing web's own mapping rather than inventing labels is what keeps
/// the two pages saying the same thing about the same data. An
/// unrecognised value falls back to its raw form rather than being
/// dropped: a moderation category this app does not know about is still
/// a real number of real reports, and hiding it would misstate the
/// totals shown above it.
enum ModerationLabels {

    static func reason(_ raw: String) -> L10nKey? {
        switch raw {
        case "Spam": return .transparencyReasonSpam
        case "Harassment or bullying": return .transparencyReasonHarassment
        case "Inappropriate content": return .transparencyReasonInappropriate
        case "Misinformation": return .transparencyReasonMisinformation
        case "Hate speech": return .transparencyReasonHateSpeech
        case "Impersonation": return .transparencyReasonImpersonation
        case "Other": return .transparencyReasonOther
        default: return nil
        }
    }

    static func status(_ raw: String) -> L10nKey? {
        switch raw {
        case "pending": return .adminReportsStatusPending
        case "reviewed": return .adminReportsStatusReviewed
        case "dismissed": return .adminReportsStatusDismissed
        case "actioned": return .adminReportsStatusActioned
        default: return nil
        }
    }

    static func action(_ raw: String) -> L10nKey? {
        switch raw {
        case "DELETE_POST": return .adminReportsActionDeletePost
        case "WARN_USER": return .adminReportsActionWarnUser
        case "BAN_USER": return .adminReportsActionBanUser
        case "MUTE_USER": return .adminReportsActionMuteUser
        case "DELETE_COMMENT": return .adminReportsActionDeleteComment
        case "OTHER": return .adminReportsActionOther
        default: return nil
        }
    }

    /// `"2026-09"` -> `"Sep 26"`, through the active locale.
    ///
    /// Parsed rather than string-sliced so a malformed bucket renders as
    /// itself instead of as a wrong month.
    static func month(_ raw: String) -> String {
        let parts = raw.split(separator: "-")
        guard parts.count == 2,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let date = Calendar.current.date(
                  from: DateComponents(year: year, month: month, day: 1)
              )
        else { return raw }

        let formatter = DateFormatter()
        formatter.locale = L10n.activeLocale
        formatter.setLocalizedDateFormatFromTemplate("MMM yy")
        return formatter.string(from: date)
    }
}
