import Foundation

/// The subscription plans and the limits that affect what the composer
/// will let a user try.
///
/// Mirrors `src/lib/limits.ts`'s `PLANS` table exactly - the same four
/// plans and the same numbers. Kept in sync by hand, like the colour
/// palette, since there is no shared token pipeline between the
/// frontends.
///
/// **These are a courtesy, not a security boundary.** Every one of them
/// is enforced server-side: post length and image count in
/// `POST /api/posts`, video size in the UploadThing router's middleware
/// via `checkVideoSize()`. Checking here only means a user finds out
/// before spending minutes uploading a file the server will reject, and
/// nothing here can raise a limit the backend does not already grant.
enum PlanLimits {

    struct Limits: Equatable {
        let postLength: Int
        let imagesPerPost: Int
        let videoUploadMB: Int
    }

    private static let free = Limits(postLength: 280, imagesPerPost: 1, videoUploadMB: 32)
    private static let pro = Limits(postLength: 1_000, imagesPerPost: 4, videoUploadMB: 100)
    private static let business = Limits(postLength: 5_000, imagesPerPost: 10, videoUploadMB: 500)
    private static let enterprise = Limits(
        postLength: 999_999,
        imagesPerPost: 999_999,
        videoUploadMB: 2_048
    )

    /// Unknown or absent plan values resolve to `free`, matching
    /// `getPlanLimits()`'s own `PLANS[plan] || PLANS.free` fallback -
    /// the safe direction, since it never grants more than the server
    /// would.
    static func limits(for plan: String?) -> Limits {
        switch plan?.lowercased() {
        case "pro": return pro
        case "business": return business
        case "enterprise": return enterprise
        default: return free
        }
    }
}
