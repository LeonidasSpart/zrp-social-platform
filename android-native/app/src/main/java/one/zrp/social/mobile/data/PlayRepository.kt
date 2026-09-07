package one.zrp.social.mobile.data

import com.google.gson.Gson
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateChallengeRequest
import one.zrp.social.mobile.network.CreateDuelRequest
import one.zrp.social.mobile.network.GenerateChallengeRequest
import one.zrp.social.mobile.network.LogicContent
import one.zrp.social.mobile.network.MemoryContent
import one.zrp.social.mobile.network.PlayChallengeDetail
import one.zrp.social.mobile.network.PlayChallengeSummary
import one.zrp.social.mobile.network.PlayChallengesPage
import one.zrp.social.mobile.network.PlayDuelDetail
import one.zrp.social.mobile.network.PlayDuelSummary
import one.zrp.social.mobile.network.PlayDuelsPage
import one.zrp.social.mobile.network.PlayHomeResponse
import one.zrp.social.mobile.network.PlayLeaderboardResponse
import one.zrp.social.mobile.network.PlayProfileResponse
import one.zrp.social.mobile.network.RespondToDuelRequest
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.network.SubmitAttemptRequest
import one.zrp.social.mobile.network.SubmitAttemptResponse
import one.zrp.social.mobile.network.TriviaContent

private val gson = Gson()

/** The real, scored (unstripped) content shapes stripAnswers() removes server-side before this ever reaches the client. */
sealed class PlayChallengeContent {
    data class Trivia(val content: TriviaContent) : PlayChallengeContent()
    data class Memory(val content: MemoryContent) : PlayChallengeContent()
    data class Logic(val content: LogicContent) : PlayChallengeContent()
}

fun PlayChallengeDetail.parsedContent(): PlayChallengeContent? {
    val element = content ?: return null
    return when (type) {
        "TRIVIA" -> PlayChallengeContent.Trivia(gson.fromJson(element, TriviaContent::class.java))
        "MEMORY" -> PlayChallengeContent.Memory(gson.fromJson(element, MemoryContent::class.java))
        "LOGIC" -> PlayChallengeContent.Logic(gson.fromJson(element, LogicContent::class.java))
        else -> null
    }
}

/**
 * ZRP PLAY - the same real /play routes the website's /play pages use:
 * trivia/memory/logic mini-games (solo and 1v1 duels), a daily
 * challenge with a streak bonus, XP/levels, achievements, and a
 * leaderboard. All scoring happens server-side against the real
 * (unstripped) challenge content - this app only ever sees the
 * answer-stripped version via getChallenge()/getDuel().
 */
class PlayRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getHome(): Result<PlayHomeResponse> = runCatching {
        ApiClient.playApi.getHome()
    }

    suspend fun getChallenges(cursor: String? = null, type: String? = null, sort: String? = null): Result<PlayChallengesPage> = runCatching {
        ApiClient.playApi.getChallenges(cursor = cursor, type = type, sort = sort)
    }

    suspend fun getChallenge(id: String): Result<PlayChallengeDetail> = runCatching {
        ApiClient.playApi.getChallenge(id).challenge
    }

    suspend fun createChallenge(
        type: String,
        title: String,
        description: String?,
        difficulty: String,
        content: Any,
    ): Result<PlayChallengeSummary> = runCatching {
        ApiClient.playApi.createChallenge(CreateChallengeRequest(type, title, description, difficulty, content)).challenge
    }

    suspend fun deleteChallenge(id: String): Result<Unit> = runCatching {
        ApiClient.playApi.deleteChallenge(id)
    }

    suspend fun submitAttempt(
        challengeId: String,
        answers: List<Int>? = null,
        moves: Int? = null,
        matchedPairs: Int? = null,
        answerIndex: Int? = null,
        answerText: String? = null,
        timeMs: Long,
        duelId: String? = null,
    ): Result<SubmitAttemptResponse> = runCatching {
        ApiClient.playApi.submitAttempt(
            challengeId,
            SubmitAttemptRequest(
                answers = answers,
                moves = moves,
                matchedPairs = matchedPairs,
                answerIndex = answerIndex,
                answerText = answerText,
                timeMs = timeMs,
                duelId = duelId,
            ),
        )
    }

    suspend fun generateChallenge(topic: String, type: String, difficulty: String): Result<PlayChallengeContent> = runCatching {
        val response = ApiClient.playApi.generateChallenge(GenerateChallengeRequest(topic, type, difficulty))
        when (response.type) {
            "TRIVIA" -> PlayChallengeContent.Trivia(gson.fromJson(response.content, TriviaContent::class.java))
            "MEMORY" -> PlayChallengeContent.Memory(gson.fromJson(response.content, MemoryContent::class.java))
            else -> PlayChallengeContent.Logic(gson.fromJson(response.content, LogicContent::class.java))
        }
    }

    suspend fun getDuels(cursor: String? = null, status: String? = null): Result<PlayDuelsPage> = runCatching {
        ApiClient.playApi.getDuels(cursor = cursor, status = status)
    }

    suspend fun createDuel(challengeId: String, opponentId: String): Result<PlayDuelSummary> = runCatching {
        ApiClient.playApi.createDuel(CreateDuelRequest(challengeId, opponentId)).duel
    }

    suspend fun getDuel(id: String): Result<PlayDuelDetail> = runCatching {
        ApiClient.playApi.getDuel(id).duel
    }

    suspend fun respondToDuel(id: String, accept: Boolean): Result<PlayDuelDetail> = runCatching {
        ApiClient.playApi.respondToDuel(id, RespondToDuelRequest(if (accept) "accept" else "decline")).duel
    }

    suspend fun getLeaderboard(scope: String = "global"): Result<PlayLeaderboardResponse> = runCatching {
        ApiClient.playApi.getLeaderboard(scope)
    }

    suspend fun getProfile(username: String): Result<PlayProfileResponse> = runCatching {
        ApiClient.playApi.getProfile(username)
    }

    /** Same real GET /search?type=users&q= OpponentSearch.tsx calls to find a duel opponent. */
    suspend fun searchOpponents(query: String): Result<List<SearchUser>> = runCatching {
        ApiClient.searchApi.search(query, type = "users").users
    }
}
