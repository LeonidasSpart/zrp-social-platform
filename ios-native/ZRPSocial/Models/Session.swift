import Foundation

/// The user summary `POST /api/mobile/auth/login` returns alongside the
/// session token.
struct MobileUser: Decodable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?
    let role: String
    let plan: String
    let onboardingCompleted: Bool
}

/// The full response from `POST /api/mobile/auth/login`.
///
/// `cookieName` is not cosmetic: the server picks between
/// `__Secure-next-auth.session-token` and `next-auth.session-token`
/// depending on whether it is served over HTTPS, and the client has to
/// replay whichever it was told.
struct LoginResponse: Decodable {
    let sessionToken: String
    let cookieName: String
    let expiresInSeconds: Int
    let user: MobileUser
}

/// `GET /api/auth/session` - NextAuth's own endpoint, not one ZRP wrote.
///
/// It reads whatever session cookie is attached and returns the same
/// `session.user` shape the website's `useSession()` sees. This is how the
/// app answers "who am I" on a cold launch without persisting identity
/// separately on-device, and how it confirms a stored token is still good.
///
/// A signed-out request gets `{}`, not a 401, so `user == nil` is the
/// signal - never an error.
struct SessionResponse: Decodable {
    let user: SessionUser?
    let expires: Date?
}

struct SessionUser: Decodable, Equatable {
    let id: String?
    let username: String?
    let name: String?
    let email: String?
    let avatarUrl: String?
    let badgeType: String?
    let role: String?
    let plan: String?
    let onboardingCompleted: Bool?
}

/// `USER`/`MODERATOR`/`ADMIN`/`JOURNALIST`, exactly as `prisma.schema`'s
/// `Role` enum stores it. Kept as a raw string rather than a typed enum -
/// `CurrentUser.role` is read in exactly one place, `isStaff` below, and a
/// closed enum would need a case added (and every switch revisited) for
/// any future role this app has no other use for.
extension CurrentUser {
    /// Whether this account may see the admin console entry point.
    ///
    /// **Not a security boundary.** Every `/api/admin/**` route re-checks
    /// the role from the database on the server (`requireStaff`/
    /// `requireAdmin` in `src/lib/admin.ts`); this only decides whether
    /// `ZrpMenuView` shows the row at all. A stale or tampered client
    /// value here changes nothing about what the server will accept.
    var isStaff: Bool { role == "ADMIN" || role == "MODERATOR" }
}

/// The signed-in identity the app carries around.
///
/// Deliberately built from either source - the login response or a
/// restored session - so downstream code never has to care which way the
/// user arrived.
struct CurrentUser: Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?
    let onboardingCompleted: Bool

    /// The subscription plan, used only to pre-check composer limits so a
    /// user is told before uploading a file the server will reject. Never
    /// a permission check - every limit is enforced server-side.
    let plan: String?

    /// `USER`/`MODERATOR`/`ADMIN`/`JOURNALIST`. Used only to decide
    /// whether to show the admin console entry point (`isStaff` below) -
    /// see that property's own doc comment for why it is not, and cannot
    /// be, a permission check.
    let role: String?

    var displayName: String { name?.isEmpty == false ? name! : username }

    init(from user: MobileUser) {
        id = user.id
        username = user.username
        name = user.name
        avatarUrl = user.avatarUrl
        badgeType = user.badgeType
        onboardingCompleted = user.onboardingCompleted
        plan = user.plan
        role = user.role
    }

    /// Returns `nil` when the session carries no identity - either signed
    /// out, or a session whose underlying `User` row no longer exists.
    init?(from user: SessionUser?) {
        guard let user, let id = user.id, let username = user.username else {
            return nil
        }
        self.id = id
        self.username = username
        name = user.name
        avatarUrl = user.avatarUrl
        badgeType = user.badgeType
        plan = user.plan
        role = user.role
        // NextAuth's session callback carries this, but treat an absent
        // value as "already onboarded" rather than forcing a restored
        // session back through onboarding on a field that simply was not
        // selected.
        onboardingCompleted = user.onboardingCompleted ?? true
    }
}
