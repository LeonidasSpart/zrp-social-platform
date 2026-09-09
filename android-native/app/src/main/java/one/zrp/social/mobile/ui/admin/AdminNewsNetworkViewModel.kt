package one.zrp.social.mobile.ui.admin

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminNewsFeed
import one.zrp.social.mobile.network.AdminNewsFeedRoster
import one.zrp.social.mobile.network.AdminNewsNetworkStatusResponse
import one.zrp.social.mobile.network.AdminNewsPublication
import one.zrp.social.mobile.network.AdminNewsSource
import one.zrp.social.mobile.network.AdminNewsSourceVerifyResponse
import one.zrp.social.mobile.network.AdminNewsStory

/** The website console's own five sections, in its own order. */
enum class NewsNetworkTab { OVERVIEW, FEEDS, SOURCES, QUEUE, PUBLICATIONS }

/**
 * What a confirmation dialog is currently asking about. Every write this
 * console can perform either changes what the public sees (enabling a
 * feed, correcting or removing a published post) or moves the pipeline
 * itself (pausing, resuming, running a cycle, provisioning accounts,
 * seeding sources), so none of them fire on a single tap.
 *
 * The three that need typed input carry no text of their own - the
 * dialog collects it and hands it back on confirm.
 */
sealed interface NewsNetworkAction {
    data class SetPaused(val paused: Boolean) : NewsNetworkAction
    data object RunCycle : NewsNetworkAction
    /** scope is "pilot" or "all". */
    data class Provision(val scope: String) : NewsNetworkAction
    data object SeedSources : NewsNetworkAction
    data class SetFeedEnabled(val feedId: String, val name: String, val enabled: Boolean) : NewsNetworkAction
    data class SetSourceEnabled(val sourceId: String, val name: String, val enabled: Boolean) : NewsNetworkAction
    data class ClearBackoff(val sourceId: String, val name: String) : NewsNetworkAction
    data class RejectStory(val storyId: String, val title: String) : NewsNetworkAction
    data class CorrectStory(val storyId: String, val title: String) : NewsNetworkAction
    data class RemovePublication(val publicationId: String, val headline: String) : NewsNetworkAction
}

/**
 * Which piece of feedback the screen should show next. These are
 * templated strings that live in strings.xml, so the ViewModel names the
 * outcome and the screen renders it in the reader's language - the
 * ViewModel never builds user-facing English of its own.
 */
sealed interface NewsNetworkMessage {
    data object Paused : NewsNetworkMessage
    data object Resumed : NewsNetworkMessage
    data class CycleRan(val published: Int, val scheduled: Int) : NewsNetworkMessage
    /** A 200 that did not run: paused, or another cycle holds the lock. */
    data class CycleSkipped(val reason: String?) : NewsNetworkMessage
    data class Provisioned(val created: Int, val updated: Int, val skipped: Int) : NewsNetworkMessage
    data class Seeded(val created: Int, val existing: Int) : NewsNetworkMessage
    data class FeedEnabled(val enabled: Boolean) : NewsNetworkMessage
    data class SourceEnabled(val enabled: Boolean) : NewsNetworkMessage
    data object BackoffCleared : NewsNetworkMessage
    data object StoryRejected : NewsNetworkMessage
    data object CorrectionPublished : NewsNetworkMessage
    data object PublicationRemoved : NewsNetworkMessage
    data class AvatarUpdated(val cover: Boolean) : NewsNetworkMessage
}

data class AdminNewsNetworkUiState(
    val isLoading: Boolean = true,
    /** True only when the status read itself failed and nothing is on screen. */
    val loadFailed: Boolean = false,
    val tab: NewsNetworkTab = NewsNetworkTab.OVERVIEW,
    val status: AdminNewsNetworkStatusResponse? = null,
    val feeds: List<AdminNewsFeed> = emptyList(),
    val roster: AdminNewsFeedRoster? = null,
    val sources: List<AdminNewsSource> = emptyList(),
    val stories: List<AdminNewsStory> = emptyList(),
    val publications: List<AdminNewsPublication> = emptyList(),
    /** The row (or header button) currently mid-write, by id. */
    val busyId: String? = null,
    val pendingAction: NewsNetworkAction? = null,
    /** A finished verification, shown as its own report rather than a toast. */
    val verifyResult: AdminNewsSourceVerifyResponse? = null,
    val verifySourceName: String? = null,
    val message: NewsNetworkMessage? = null,
    val error: String? = null,
)

/**
 * The native ZRP News Network console - a surface onto the same
 * /api/admin/news-network routes the website's own
 * src/app/admin/news-network/page.tsx calls, with the same five sections
 * it has: overview, feeds, sources, the editorial queue and
 * publications.
 *
 * This is the automated editorial pipeline (RSS ingestion -> clustering
 * -> per-language summaries -> scheduled posts from provisioned
 * editorial accounts), NOT the journalist news CMS at /admin/news.
 *
 * Every read here is requireStaff and every write is requireAdmin
 * server-side, which is why the screen is entered from the admin-gated
 * block of the dashboard and refuses a non-admin outright: a MODERATOR
 * could read this data but could not action any of it, and a console
 * whose every button 403s is worse than an honest refusal. The gate is
 * never the authorization boundary - the routes are.
 *
 * Loading mirrors the website's own console exactly: all five reads run
 * in parallel, the status read is the one that decides whether the
 * screen can render at all, and every successful write reloads the whole
 * console rather than patching a row in locally - the pipeline moves
 * underneath this screen on its own schedule, so a local patch would be
 * a guess about server state.
 */
class AdminNewsNetworkViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminNewsNetworkUiState())
    val state: StateFlow<AdminNewsNetworkUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, loadFailed = false) }
        viewModelScope.launch {
            val statusDeferred = async { repository.getNewsNetworkStatus() }
            val feedsDeferred = async { repository.getNewsNetworkFeeds() }
            val sourcesDeferred = async { repository.getNewsNetworkSources() }
            val storiesDeferred = async { repository.getNewsNetworkStories(STORY_LIMIT) }
            val publicationsDeferred = async { repository.getNewsNetworkPublications(PUBLICATION_LIMIT) }

            val status = statusDeferred.await()
            val feeds = feedsDeferred.await()
            val sources = sourcesDeferred.await()
            val stories = storiesDeferred.await()
            val publications = publicationsDeferred.await()

            status
                .onSuccess { statusResponse ->
                    _state.update { current ->
                        current.copy(
                            isLoading = false,
                            loadFailed = false,
                            status = statusResponse,
                            // A section whose own read failed keeps
                            // whatever it last had rather than being
                            // silently emptied - an empty list here
                            // would read as "nothing exists", which is
                            // a different fact from "this did not load".
                            feeds = feeds.getOrNull()?.feeds ?: current.feeds,
                            roster = feeds.getOrNull()?.roster ?: current.roster,
                            sources = sources.getOrNull()?.sources ?: current.sources,
                            stories = stories.getOrNull()?.stories ?: current.stories,
                            publications = publications.getOrNull()?.publications ?: current.publications,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            loadFailed = it.status == null,
                            error = error.message,
                        )
                    }
                }
        }
    }

    fun selectTab(tab: NewsNetworkTab) = _state.update { it.copy(tab = tab) }

    fun requestAction(action: NewsNetworkAction) = _state.update { it.copy(pendingAction = action) }

    fun cancelAction() = _state.update { it.copy(pendingAction = null) }

    /**
     * Runs whatever the confirmation dialog was asking about. `input` is
     * the reason/note the three text actions collected; it is ignored by
     * the rest, and those three are never reached with a blank one (the
     * dialog's confirm button stays disabled until something is typed,
     * and the routes require it too).
     */
    fun confirmAction(input: String = "") {
        val action = _state.value.pendingAction ?: return
        _state.update { it.copy(pendingAction = null, busyId = busyKey(action), error = null, message = null) }

        viewModelScope.launch {
            when (action) {
                is NewsNetworkAction.SetPaused ->
                    finish(repository.setNewsAutomationPaused(action.paused)) {
                        if (action.paused) NewsNetworkMessage.Paused else NewsNetworkMessage.Resumed
                    }

                is NewsNetworkAction.RunCycle ->
                    finish(repository.runNewsNetworkCycle()) { result ->
                        if (result.ran) {
                            NewsNetworkMessage.CycleRan(result.published, result.scheduled)
                        } else {
                            NewsNetworkMessage.CycleSkipped(result.reason)
                        }
                    }

                is NewsNetworkAction.Provision ->
                    finish(repository.provisionNewsFeeds(action.scope)) { result ->
                        NewsNetworkMessage.Provisioned(
                            created = result.created.size,
                            updated = result.updated.size,
                            skipped = result.skipped.size,
                        )
                    }

                is NewsNetworkAction.SeedSources ->
                    finish(repository.seedNewsSources()) { result ->
                        NewsNetworkMessage.Seeded(result.created.size, result.existing.size)
                    }

                is NewsNetworkAction.SetFeedEnabled ->
                    finish(repository.setNewsFeedEnabled(action.feedId, action.enabled)) {
                        NewsNetworkMessage.FeedEnabled(action.enabled)
                    }

                is NewsNetworkAction.SetSourceEnabled ->
                    finish(repository.setNewsSourceEnabled(action.sourceId, action.enabled)) {
                        NewsNetworkMessage.SourceEnabled(action.enabled)
                    }

                is NewsNetworkAction.ClearBackoff ->
                    finish(repository.clearNewsSourceBackoff(action.sourceId)) {
                        NewsNetworkMessage.BackoffCleared
                    }

                is NewsNetworkAction.RejectStory ->
                    finish(repository.rejectNewsStory(action.storyId, input.trim())) {
                        NewsNetworkMessage.StoryRejected
                    }

                is NewsNetworkAction.CorrectStory ->
                    finish(repository.correctNewsStory(action.storyId, input.trim())) {
                        NewsNetworkMessage.CorrectionPublished
                    }

                is NewsNetworkAction.RemovePublication ->
                    finish(repository.removeNewsPublication(action.publicationId, input.trim())) {
                        NewsNetworkMessage.PublicationRemoved
                    }
            }
        }
    }

    /**
     * Verification is its own flow: it takes no confirmation (it fetches
     * and parses one feed and writes nothing at all), and a feed that
     * could not be read comes back as a successful 200 carrying ok=false
     * - a real answer to show, not an error. Nothing is reloaded
     * afterwards because nothing changed server-side.
     */
    fun verifySource(sourceId: String, sourceName: String) {
        if (_state.value.busyId != null) return
        _state.update { it.copy(busyId = "verify-$sourceId", error = null, message = null) }
        viewModelScope.launch {
            repository.verifyNewsSource(sourceId)
                .onSuccess { result ->
                    _state.update {
                        it.copy(busyId = null, verifyResult = result, verifySourceName = sourceName)
                    }
                }
                .onFailure { error -> _state.update { it.copy(busyId = null, error = error.message) } }
        }
    }

    fun dismissVerifyResult() = _state.update { it.copy(verifyResult = null, verifySourceName = null) }

    /**
     * An editorial feed's account has no password and can never sign in,
     * so this admin upload is the only way its avatar or banner is ever
     * set. field is "avatarFile" or "coverFile" - the route reads which
     * form field arrived to decide which column it writes.
     */
    fun uploadFeedImage(feedId: String, contentResolver: ContentResolver, uri: Uri, cover: Boolean) {
        if (_state.value.busyId != null) return
        val field = if (cover) "coverFile" else "avatarFile"
        _state.update { it.copy(busyId = feedId, error = null, message = null) }
        viewModelScope.launch {
            finish(repository.uploadNewsFeedImage(feedId, contentResolver, uri, field)) {
                NewsNetworkMessage.AvatarUpdated(cover)
            }
        }
    }

    private inline fun <T> finish(result: Result<T>, message: (T) -> NewsNetworkMessage) {
        result
            .onSuccess { value ->
                _state.update { it.copy(busyId = null, message = message(value)) }
                load()
            }
            .onFailure { error -> _state.update { it.copy(busyId = null, error = error.message) } }
    }

    private fun busyKey(action: NewsNetworkAction): String = when (action) {
        is NewsNetworkAction.SetPaused -> "pause"
        is NewsNetworkAction.RunCycle -> "run"
        is NewsNetworkAction.Provision -> "provision-${action.scope}"
        is NewsNetworkAction.SeedSources -> "seed"
        is NewsNetworkAction.SetFeedEnabled -> action.feedId
        is NewsNetworkAction.SetSourceEnabled -> action.sourceId
        is NewsNetworkAction.ClearBackoff -> action.sourceId
        is NewsNetworkAction.RejectStory -> action.storyId
        is NewsNetworkAction.CorrectStory -> action.storyId
        is NewsNetworkAction.RemovePublication -> action.publicationId
    }

    fun consumeError() = _state.update { it.copy(error = null) }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    private companion object {
        // The same two limits the website's console asks for; both are
        // capped at 100 server-side.
        const val STORY_LIMIT = 50
        const val PUBLICATION_LIMIT = 50
    }
}

class AdminNewsNetworkViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminNewsNetworkViewModel(repository) as T
}
