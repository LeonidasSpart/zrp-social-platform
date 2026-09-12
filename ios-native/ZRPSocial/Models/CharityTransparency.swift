import Foundation

/// `GET /api/transparency/charity` - ZRP's public charity ledger.
///
/// Public, and deliberately so: the whole point of a transparency page is
/// that anyone can read it without an account. The route takes no session
/// and this app asks for it without one.
///
/// The two figures mean different things and the route is careful to say
/// so. `committed` is computed from completed tips and premium purchases
/// - what the commitment OWES so far. `disbursed` is the sum of real
/// payment records an admin entered. Presenting them as one number would
/// claim money had moved when it may not have.
struct CharityTransparency: Decodable, Equatable {
    let generatedAt: Date
    let committed: Committed
    let disbursed: Disbursed

    struct Committed: Decodable, Equatable {
        let amount: Double
        let currency: String
        /// The route's own explanation of what this figure is. Shown
        /// from the app's translations rather than this string, which is
        /// English-only server-side - but kept so the two can be
        /// compared if they ever disagree.
        let note: String?
    }

    struct Disbursed: Decodable, Equatable {
        let total: Double
        let byCause: [String: Double]
        let records: [Disbursement]
    }
}

/// One real payment, as recorded by staff.
struct Disbursement: Decodable, Identifiable, Equatable {
    let id: String
    let beneficiaryName: String
    let cause: String
    let amount: Double
    let currency: String
    let disbursedAt: Date
    let note: String?

    /// Evidence for the payment. Optional, and when absent no "proof"
    /// control is shown - an empty link would suggest evidence exists.
    let proofUrl: String?

    /// This app's label for one of the route's four causes.
    ///
    /// An unrecognised cause renders its raw value rather than being
    /// hidden: unlike a milestone badge, a disbursement is a financial
    /// record, and silently dropping one from a public ledger would be
    /// worse than showing an untranslated category name.
    var causeTitleKey: L10nKey? {
        switch cause.lowercased() {
        case "orphanages": return .charityOrphanagesLabel
        case "schools": return .charitySchoolsLabel
        case "hospitals": return .charityHospitalsLabel
        case "climate": return .charityClimateProjectsLabel
        default: return nil
        }
    }
}
