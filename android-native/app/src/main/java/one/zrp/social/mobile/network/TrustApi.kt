package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.Path

// The real GET route also returns maxScore/breakdown (a pre-grouped-
// by-category view of the same score) - src/app/trust/[username]/
// page.tsx's own client-side TrustData interface never declares or
// reads either field, though: it groups the flat `signals` list below
// by category itself instead. Left unmodeled here for the same reason
// - nothing in the real UI this screen ports ever needs them.
data class TrustPassport(
    val score: Int,
    val level: String,
    val levelLabel: String,
    val generatedAt: String,
)

data class TrustUser(
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
    val createdAt: String,
    val accountAgeDays: Int,
    val accountAgeMonths: Int,
    val isPrivate: Boolean,
    val plan: String?,
)

data class TrustSignal(
    val key: String,
    val title: String,
    val description: String,
    val verified: Boolean,
    val category: String,
)

data class TrustAdditionalSignal(
    val key: String,
    val title: String,
    val description: String,
    val verified: Boolean,
)

data class TrustCounts(
    val posts: Int,
    val followers: Int,
    val following: Int,
)

data class TrustPassportResponse(
    val passport: TrustPassport,
    val user: TrustUser,
    val signals: List<TrustSignal>,
    val additionalSignals: List<TrustAdditionalSignal>,
    val counts: TrustCounts,
)

/**
 * ZRP Trust Passport - the real, session-optional GET
 * /api/users/{username}/trust route src/app/trust/[username]/page.tsx
 * itself calls: a transparent trust score built entirely from public,
 * already-authoritative account signals (email verification, profile
 * completeness, account age, community activity, ZRP verification
 * badge) - explicitly not an identity, popularity, financial, or
 * moderation score. No auth required server-side, matching the real
 * route (which has no session check at all) - any account's Trust
 * Passport is public, same as its profile.
 */
interface TrustApi {
    @GET("users/{username}/trust")
    suspend fun getTrustPassport(@Path("username") username: String): TrustPassportResponse
}
