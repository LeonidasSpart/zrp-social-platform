package one.zrp.social.mobile.ui.admin

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.data.MediaUploadRepository
import one.zrp.social.mobile.network.AdminNewsArticle
import one.zrp.social.mobile.network.SaveNewsArticleRequest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/** The 5 real NewsArticleStatus values, in the website's own <select> order. */
val NEWS_STATUSES = listOf("DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED")

/** The banner the list shows after a write landed - the website's own success strings. */
enum class AdminNewsMessage { CREATED, UPDATED, DELETED, APPROVED, SENT_BACK }

/**
 * The four client-side checks the website's own handleSubmit runs, in
 * its exact order, before it posts anything. The server re-validates
 * every one of them (and is the only real boundary); these exist purely
 * so the editor doesn't get a round trip for something guaranteed to be
 * rejected.
 */
enum class AdminNewsFormError { TITLE, SLUG, CONTENT, AUTHOR_ID }

/** Ported verbatim from the admin News page's own slugify(). */
internal fun newsSlugify(value: String): String =
    value.lowercase()
        .trim()
        .replace(Regex("[^a-z0-9\\s-]"), "")
        .replace(Regex("\\s+"), "-")
        .replace(Regex("-+"), "-")

private val newsIsoFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

/** Parses a Prisma/JSON ISO instant into epoch millis, or null if absent/unparseable. */
internal fun parseNewsInstant(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    return try { newsIsoFormat.get()!!.parse(iso)?.time } catch (_: Exception) { null }
}

/** Renders epoch millis back into the ISO instant the route parses with `new Date(...)`. */
internal fun formatNewsInstant(millis: Long): String = newsIsoFormat.get()!!.format(millis)

/**
 * The admin list/editor's own date rendering - the local-timezone
 * equivalent of the website's
 * `Intl.DateTimeFormat(undefined, {year, month: "short", day, hour, minute})`.
 */
internal fun formatAdminNewsDateTime(millis: Long): String =
    SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault()).format(millis)

/**
 * The UTC-midnight millis a Material DatePicker uses to address the
 * calendar day a local instant falls on, so reopening the picker lands
 * on the day the editor actually sees rather than a UTC-shifted one.
 */
internal fun newsUtcDayMillis(localMillis: Long): Long {
    val local = Calendar.getInstance().apply { timeInMillis = localMillis }
    return Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
        clear()
        set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH))
    }.timeInMillis
}

/** The local wall-clock hour/minute of an instant, for seeding the time picker. */
internal fun newsLocalHourMinute(localMillis: Long): Pair<Int, Int> {
    val local = Calendar.getInstance().apply { timeInMillis = localMillis }
    return local.get(Calendar.HOUR_OF_DAY) to local.get(Calendar.MINUTE)
}

/**
 * The editor form, held here rather than in a screen-local remember so
 * that a rotation mid-article doesn't discard a half-written story. A
 * null articleId is the create half (POST), a non-null one the update
 * half (PUT) - the same one form the website shares between its own
 * "New Article" and "Edit" buttons.
 */
data class AdminNewsEditorState(
    val articleId: String? = null,
    val editingSlug: String = "",
    val title: String = "",
    val slug: String = "",
    val excerpt: String = "",
    val content: String = "",
    val coverImage: String = "",
    val sourceName: String = "",
    val sourceUrl: String = "",
    val category: String = "WORLD",
    val status: String = "DRAFT",
    val authorId: String = "",
    val featured: Boolean = false,
    // Epoch millis of the publish instant, or null for "not published"
    // (which the route reads as "clear it", or on a PUBLISHED create as
    // "stamp now()"). Kept as an instant rather than as the website's
    // local "yyyy-MM-ddTHH:mm" string so the timezone round trip is
    // lossless - see the screen's own note.
    val publishedAtMillis: Long? = null,
    val uploadingCover: Boolean = false,
    val coverUploadErrorDetail: String? = null,
)

data class AdminNewsUiState(
    val isLoading: Boolean = true,
    // "" is the website's own "All Statuses"/"All Categories" option:
    // the route only applies a filter that is a real enum value.
    val statusFilter: String = "",
    val categoryFilter: String = "",
    val search: String = "",
    val articles: List<AdminNewsArticle> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val total: Int = 0,
    val busyArticleId: String? = null,
    val confirmDelete: AdminNewsArticle? = null,
    val rejectArticleId: String? = null,
    val editor: AdminNewsEditorState? = null,
    val isSaving: Boolean = false,
    val formError: AdminNewsFormError? = null,
    val message: AdminNewsMessage? = null,
    val error: String? = null,
) {
    /**
     * The website's own two derived summary cards - both count only the
     * rows on the current page, which is why their labels say "on Page".
     * The third card is pagination.total, straight from the route.
     */
    val publishedOnPage: Int get() = articles.count { it.status == "PUBLISHED" }
    val draftsOnPage: Int get() = articles.count { it.status == "DRAFT" }
}

/**
 * Ported from src/app/admin/news/page.tsx - the ZRP News editorial desk.
 *
 * Two distinct jobs live on the one page, exactly as they do on the
 * website: full CRUD over NewsArticle (create/edit/delete any article,
 * set its category, status, cover, source, author, publish instant and
 * the single site-wide featured flag), and the review half of the
 * journalist submission workflow (approve a PENDING_REVIEW article
 * straight to PUBLISHED, or send it back as REJECTED with a note the
 * journalist reads on their own dashboard).
 *
 * Both halves are requireStaff server-side, so a MODERATOR gets the same
 * screen a full ADMIN does - and the server stays the only authorization
 * boundary regardless: every action below is one request whose outcome
 * the route decides. Nothing is computed locally, including the
 * "only one article can be featured" rule, which the route enforces by
 * clearing every other featured row inside the same write.
 */
class AdminNewsViewModel(
    private val repository: AdminRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(AdminNewsUiState())
    val state: StateFlow<AdminNewsUiState> = _state.asStateFlow()

    fun load(targetPage: Int = _state.value.page) {
        val s = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getNewsArticles(
                status = s.statusFilter,
                category = s.categoryFilter,
                search = s.search.trim(),
                page = targetPage,
                // The website's own hardcoded page size.
                limit = PAGE_SIZE,
            )
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            articles = response.articles,
                            page = response.pagination?.page ?: targetPage,
                            totalPages = response.pagination?.totalPages ?: 1,
                            total = response.pagination?.total ?: response.articles.size,
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setStatusFilter(status: String) {
        if (status == _state.value.statusFilter) return
        _state.update { it.copy(statusFilter = status) }
        load(1)
    }

    fun setCategoryFilter(category: String) {
        if (category == _state.value.categoryFilter) return
        _state.update { it.copy(categoryFilter = category) }
        load(1)
    }

    fun setSearch(value: String) = _state.update { it.copy(search = value) }

    fun submitSearch() = load(1)

    fun setPage(page: Int) {
        if (page < 1 || page > _state.value.totalPages) return
        load(page)
    }

    // ─── Editor ──────────────────────────────────────────────────────

    fun openCreate() {
        _state.update { it.copy(editor = AdminNewsEditorState(), formError = null, error = null) }
    }

    fun openEdit(article: AdminNewsArticle) {
        _state.update {
            it.copy(
                editor = AdminNewsEditorState(
                    articleId = article.id,
                    editingSlug = article.slug,
                    title = article.title,
                    slug = article.slug,
                    excerpt = article.excerpt.orEmpty(),
                    content = article.content,
                    coverImage = article.coverImage.orEmpty(),
                    sourceName = article.sourceName.orEmpty(),
                    sourceUrl = article.sourceUrl.orEmpty(),
                    category = article.category,
                    status = article.status,
                    // The website reads the author id off the included
                    // relation; authorId is the same value on the row.
                    authorId = article.authorId,
                    featured = article.featured,
                    publishedAtMillis = parseNewsInstant(article.publishedAt),
                ),
                formError = null,
                error = null,
            )
        }
    }

    fun closeEditor() {
        if (_state.value.isSaving) return
        _state.update { it.copy(editor = null, formError = null) }
    }

    private fun updateEditor(block: (AdminNewsEditorState) -> AdminNewsEditorState) {
        _state.update { s -> s.editor?.let { s.copy(editor = block(it)) } ?: s }
    }

    // On create the website re-slugifies the slug from every keystroke of
    // the title; on edit it deliberately leaves an existing slug alone
    // (changing a live URL is an explicit act).
    fun onTitleChange(value: String) = updateEditor { editor ->
        editor.copy(title = value, slug = if (editor.articleId == null) newsSlugify(value) else editor.slug)
    }

    fun onSlugChange(value: String) = updateEditor { it.copy(slug = newsSlugify(value)) }
    fun onExcerptChange(value: String) = updateEditor { it.copy(excerpt = value) }
    fun onContentChange(value: String) = updateEditor { it.copy(content = value) }
    fun onCoverImageChange(value: String) = updateEditor { it.copy(coverImage = value) }
    fun onSourceNameChange(value: String) = updateEditor { it.copy(sourceName = value) }
    fun onSourceUrlChange(value: String) = updateEditor { it.copy(sourceUrl = value) }
    fun onCategoryChange(value: String) = updateEditor { it.copy(category = value) }
    fun onStatusChange(value: String) = updateEditor { it.copy(status = value) }
    fun onAuthorIdChange(value: String) = updateEditor { it.copy(authorId = value) }
    fun onFeaturedChange(value: Boolean) = updateEditor { it.copy(featured = value) }
    fun clearPublishedAt() = updateEditor { it.copy(publishedAtMillis = null) }

    /**
     * Combines a calendar day (as the UTC-midnight millis a Material
     * DatePicker reports) with a wall-clock hour/minute into a real
     * instant in the device's own timezone, which is what the website's
     * `datetime-local` + `new Date(value).toISOString()` pair also
     * produces.
     */
    fun setPublishedAt(utcDayMillis: Long, hour: Int, minute: Int) {
        val day = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = utcDayMillis }
        val local = Calendar.getInstance().apply {
            clear()
            set(
                day.get(Calendar.YEAR),
                day.get(Calendar.MONTH),
                day.get(Calendar.DAY_OF_MONTH),
                hour,
                minute,
                0,
            )
        }
        updateEditor { it.copy(publishedAtMillis = local.timeInMillis) }
    }

    /**
     * Uploads a picked cover through the real two-step UploadThing
     * protocol on the "newsCoverImage" route - the same slug and the
     * same repository the journalist article editor already uses, and a
     * route whose own middleware only requires a signed-in user. The
     * resulting CDN url is written into the very same coverImage field
     * the website has an editor paste a url into by hand; nothing about
     * the request the article is saved with changes.
     */
    fun onCoverImagePicked(
        contentResolver: ContentResolver,
        uri: Uri,
        fileName: String,
        mimeType: String,
        size: Long,
    ) {
        updateEditor { it.copy(uploadingCover = true, coverUploadErrorDetail = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "newsCoverImage",
                contentResolver = contentResolver,
                uri = uri,
                fileName = fileName,
                mimeType = mimeType,
                size = size,
                onProgress = {},
            ).onSuccess { uploaded ->
                updateEditor { it.copy(uploadingCover = false, coverImage = uploaded.url) }
            }.onFailure { error ->
                updateEditor { it.copy(uploadingCover = false, coverUploadErrorDetail = error.message ?: "") }
            }
        }
    }

    fun save() {
        val editor = _state.value.editor ?: return
        if (_state.value.isSaving) return

        // Same four checks, same order, as the website's own handleSubmit.
        val formError = when {
            editor.title.isBlank() -> AdminNewsFormError.TITLE
            editor.slug.isBlank() -> AdminNewsFormError.SLUG
            editor.content.isBlank() -> AdminNewsFormError.CONTENT
            editor.authorId.isBlank() -> AdminNewsFormError.AUTHOR_ID
            else -> null
        }
        if (formError != null) {
            _state.update { it.copy(formError = formError) }
            return
        }

        val request = SaveNewsArticleRequest(
            title = editor.title.trim(),
            slug = editor.slug.trim(),
            excerpt = editor.excerpt.trim(),
            // Body copy is sent untrimmed, exactly like the website -
            // the route trims it on create and stores it verbatim on
            // update, and leading indentation is meaningful in an
            // article body.
            content = editor.content,
            coverImage = editor.coverImage.trim(),
            sourceName = editor.sourceName.trim(),
            sourceUrl = editor.sourceUrl.trim(),
            category = editor.category,
            status = editor.status,
            authorId = editor.authorId.trim(),
            featured = editor.featured,
            publishedAt = editor.publishedAtMillis?.let { formatNewsInstant(it) } ?: "",
        )

        _state.update { it.copy(isSaving = true, formError = null, error = null) }
        viewModelScope.launch {
            val articleId = editor.articleId
            val result = if (articleId == null) {
                repository.createNewsArticle(request)
            } else {
                repository.updateNewsArticle(articleId, request)
            }
            result
                .onSuccess {
                    _state.update {
                        it.copy(
                            isSaving = false,
                            editor = null,
                            message = if (articleId == null) AdminNewsMessage.CREATED else AdminNewsMessage.UPDATED,
                        )
                    }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(isSaving = false, error = error.message) } }
        }
    }

    // ─── Review queue (PENDING_REVIEW rows only) ─────────────────────

    /** Approve has no confirmation on the website either - it posts straight away. */
    fun approve(article: AdminNewsArticle) = review(article.id, "PUBLISHED", null, AdminNewsMessage.APPROVED)

    fun requestReject(articleId: String) = _state.update { it.copy(rejectArticleId = articleId) }

    fun cancelReject() = _state.update { it.copy(rejectArticleId = null) }

    fun confirmReject(note: String) {
        val articleId = _state.value.rejectArticleId ?: return
        _state.update { it.copy(rejectArticleId = null) }
        // Always sent on a reject, "" included - the route coerces a
        // blank note to null just as the website's `reviewNote || null`
        // does, so clearing a stale note works.
        review(articleId, "REJECTED", note.trim(), AdminNewsMessage.SENT_BACK)
    }

    private fun review(articleId: String, status: String, note: String?, message: AdminNewsMessage) {
        _state.update { it.copy(busyArticleId = articleId, error = null) }
        viewModelScope.launch {
            repository.reviewNewsArticle(articleId, status, note)
                .onSuccess {
                    _state.update { it.copy(busyArticleId = null, message = message) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(busyArticleId = null, error = error.message) } }
        }
    }

    // ─── Delete ──────────────────────────────────────────────────────

    fun requestDelete(article: AdminNewsArticle) = _state.update { it.copy(confirmDelete = article) }

    fun cancelDelete() = _state.update { it.copy(confirmDelete = null) }

    fun confirmDelete() {
        val article = _state.value.confirmDelete ?: return
        _state.update { it.copy(confirmDelete = null, busyArticleId = article.id, error = null) }
        viewModelScope.launch {
            repository.deleteNewsArticle(article.id)
                .onSuccess {
                    // The website steps back a page when it just removed
                    // the only row on a page past the first, so the
                    // editor isn't left staring at an empty list.
                    val s = _state.value
                    val shouldStepBack = s.articles.size == 1 && s.page > 1
                    _state.update { it.copy(busyArticleId = null, message = AdminNewsMessage.DELETED) }
                    load(if (shouldStepBack) s.page - 1 else s.page)
                }
                .onFailure { error -> _state.update { it.copy(busyArticleId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    fun dismissCoverUploadError() = updateEditor { it.copy(coverUploadErrorDetail = null) }

    companion object {
        const val PAGE_SIZE = 20
    }
}

class AdminNewsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminNewsViewModel(repository) as T
}
