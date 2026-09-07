package one.zrp.social.mobile.network

import com.google.gson.JsonElement
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

val PLAY_CHALLENGE_TYPES = listOf("TRIVIA", "MEMORY", "LOGIC")
val PLAY_DIFFICULTIES = listOf("easy", "medium", "hard")

data class PlayUserSummary(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
)

data class PlayChallengeSummary(
    val id: String,
    val type: String,
    val title: String,
    val description: String? = null,
    val difficulty: String,
    val maxScore: Int,
    val isDaily: Boolean = false,
    val isAiGenerated: Boolean = false,
    val playCount: Int = 0,
    val createdAt: String? = null,
    val creator: PlayUserSummary? = null,
)

data class PlayChallengesPage(val challenges: List<PlayChallengeSummary>, val nextCursor: String?)

data class TriviaQuestion(val q: String, val options: List<String>, val correctIndex: Int? = null)
data class TriviaContent(val questions: List<TriviaQuestion> = emptyList())
data class MemoryContent(val pairs: List<String> = emptyList())
data class LogicContent(val prompt: String = "", val options: List<String>? = null, val correctIndex: Int? = null, val answer: String? = null)

/**
 * `content`'s shape depends on `type` (TRIVIA -> {questions}, MEMORY ->
 * {pairs}, LOGIC -> {prompt, options?, correctIndex?, answer?}) - the
 * same server-side polymorphism CampaignDetail's web counterpart just
 * casts with `as any`. Retrofit's plain Gson converter can't map that
 * to a typed field directly, so it stays a raw JsonElement here and
 * PlayRepository parses it into TriviaContent/MemoryContent/LogicContent
 * based on `type` once it knows which shape to expect.
 */
data class PlayChallengeDetail(
    val id: String,
    val type: String,
    val title: String,
    val description: String? = null,
    val difficulty: String,
    val maxScore: Int,
    val isDaily: Boolean = false,
    val isAiGenerated: Boolean = false,
    val status: String? = null,
    val playCount: Int = 0,
    val createdAt: String? = null,
    val creator: PlayUserSummary? = null,
    val alreadyPlayed: Boolean = false,
    val content: JsonElement? = null,
)

data class PlayChallengeDetailResponse(val challenge: PlayChallengeDetail)

data class CreateChallengeRequest(
    val type: String,
    val title: String,
    val description: String?,
    val difficulty: String,
    val content: Any,
)

data class PlayChallengeWriteResponse(val challenge: PlayChallengeSummary)

data class SubmitAttemptRequest(
    val answers: List<Int>? = null,
    val moves: Int? = null,
    val matchedPairs: Int? = null,
    val answerIndex: Int? = null,
    val answerText: String? = null,
    val timeMs: Long,
    val duelId: String? = null,
)

data class PlayAchievement(
    val key: String,
    val name: String,
    val description: String,
    val icon: String,
    val xpReward: Int = 0,
    val unlockedAt: String? = null,
)

data class SubmitAttemptResponse(
    val score: Int,
    val maxScore: Int,
    val xpEarned: Int? = null,
    val totalXp: Int? = null,
    val level: Int? = null,
    val streak: Int? = null,
    val unlockedAchievements: List<PlayAchievement> = emptyList(),
    val waitingForOpponent: Boolean = false,
    val duelCompleted: Boolean = false,
    val winnerId: String? = null,
    val challengerScore: Int? = null,
    val opponentScore: Int? = null,
    val correctCount: Int? = null,
    val total: Int? = null,
    val isCorrect: Boolean? = null,
)

data class GenerateChallengeRequest(val topic: String, val type: String, val difficulty: String)
data class GenerateChallengeResponse(
    val title: String,
    val description: String?,
    val content: JsonElement,
    val type: String,
    val difficulty: String,
)

data class PlayProfileStats(
    val totalXp: Int = 0,
    val level: Int = 1,
    val currentStreak: Int = 0,
    val longestStreak: Int = 0,
    val challengesCompleted: Int = 0,
    val duelsWon: Int = 0,
    val duelsPlayed: Int = 0,
    val xpIntoLevel: Int = 0,
    val xpForLevel: Int = 100,
    val xpToNextLevel: Int = 100,
    val progressRatio: Float = 0f,
)

data class PlayDuelChallengeRef(val id: String, val type: String, val title: String, val difficulty: String, val maxScore: Int = 0)

data class PlayDuelSummary(
    val id: String,
    val status: String,
    val challengerId: String,
    val opponentId: String,
    val challengerScore: Int? = null,
    val opponentScore: Int? = null,
    val winnerId: String? = null,
    val createdAt: String,
    val expiresAt: String,
    val completedAt: String? = null,
    val challenge: PlayDuelChallengeRef,
    val challenger: PlayUserSummary,
    val opponent: PlayUserSummary,
)

data class PlayDuelDetail(
    val id: String,
    val status: String,
    val challengerId: String,
    val opponentId: String,
    val challengerScore: Int? = null,
    val opponentScore: Int? = null,
    val winnerId: String? = null,
    val createdAt: String,
    val expiresAt: String,
    val completedAt: String? = null,
    val challenge: PlayChallengeDetail,
    val challenger: PlayUserSummary,
    val opponent: PlayUserSummary,
)

data class PlayDuelDetailResponse(val duel: PlayDuelDetail)
data class PlayDuelsPage(val duels: List<PlayDuelSummary>, val nextCursor: String?)
data class CreateDuelRequest(val challengeId: String, val opponentId: String)
data class PlayDuelWriteResponse(val duel: PlayDuelSummary)
data class RespondToDuelRequest(val action: String)

data class PlayLeaderboardUser(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
    val country: String? = null,
)

data class PlayLeaderboardEntry(
    val rank: Int,
    val userId: String,
    val totalXp: Int,
    val level: Int,
    val currentStreak: Int? = null,
    val challengesCompleted: Int? = null,
    val duelsWon: Int? = null,
    val user: PlayLeaderboardUser,
)

data class PlayLeaderboardResponse(val leaderboard: List<PlayLeaderboardEntry>, val myRank: Int? = null)

data class PlayHomeResponse(
    val dailyChallenge: PlayChallengeDetail? = null,
    val trending: List<PlayChallengeSummary> = emptyList(),
    val topLeaderboard: List<PlayLeaderboardEntry> = emptyList(),
    val myProfile: PlayProfileStats? = null,
    val pendingDuels: List<PlayDuelSummary> = emptyList(),
    val activeDuels: List<PlayDuelSummary> = emptyList(),
)

data class PlayRecentAttempt(
    val id: String,
    val score: Int,
    val xpEarned: Int,
    val createdAt: String,
    val challenge: PlayDuelChallengeRef,
)

data class PlayProfileResponse(
    val user: PlayUserSummary,
    val profile: PlayProfileStats,
    val achievements: List<PlayAchievement> = emptyList(),
    val recentAttempts: List<PlayRecentAttempt> = emptyList(),
)

interface PlayApi {
    @GET("play/home") suspend fun getHome(): PlayHomeResponse

    @GET("play/challenges")
    suspend fun getChallenges(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
        @Query("type") type: String? = null,
        @Query("creatorId") creatorId: String? = null,
        @Query("sort") sort: String? = null,
    ): PlayChallengesPage

    @POST("play/challenges") suspend fun createChallenge(@Body request: CreateChallengeRequest): PlayChallengeWriteResponse

    @GET("play/challenges/{id}") suspend fun getChallenge(@Path("id") id: String): PlayChallengeDetailResponse

    @DELETE("play/challenges/{id}") suspend fun deleteChallenge(@Path("id") id: String)

    @POST("play/challenges/{id}/submit")
    suspend fun submitAttempt(@Path("id") id: String, @Body request: SubmitAttemptRequest): SubmitAttemptResponse

    @POST("play/challenges/generate")
    suspend fun generateChallenge(@Body request: GenerateChallengeRequest): GenerateChallengeResponse

    @GET("play/duels")
    suspend fun getDuels(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
        @Query("status") status: String? = null,
    ): PlayDuelsPage

    @POST("play/duels") suspend fun createDuel(@Body request: CreateDuelRequest): PlayDuelWriteResponse

    @GET("play/duels/{id}") suspend fun getDuel(@Path("id") id: String): PlayDuelDetailResponse

    @PUT("play/duels/{id}") suspend fun respondToDuel(@Path("id") id: String, @Body request: RespondToDuelRequest): PlayDuelDetailResponse

    @GET("play/leaderboard") suspend fun getLeaderboard(@Query("scope") scope: String = "global"): PlayLeaderboardResponse

    @GET("play/profile/{username}") suspend fun getProfile(@Path("username") username: String): PlayProfileResponse
}
