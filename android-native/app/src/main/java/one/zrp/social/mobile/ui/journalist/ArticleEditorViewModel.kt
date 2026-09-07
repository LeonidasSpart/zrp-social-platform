package one.zrp.social.mobile.ui.journalist

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
import one.zrp.social.mobile.data.JournalistRepository
import one.zrp.social.mobile.data.MediaUploadRepository

enum class ArticleSaving { DRAFT, SUBMIT }

data class ArticleEditorUiState(
    val isLoadingExisting: Boolean = false,
    val notFound: Boolean = false,
    val title: String = "",
    val slug: String = "",
    val slugTouched: Boolean = false,
    val excerpt: String = "",
    val content: String = "",
    val coverImage: String = "",
    val sourceName: String = "",
    val sourceUrl: String = "",
    val category: String = "WORLD",
    val existingStatus: String? = null,
    val reviewNote: String? = null,
    val uploadingCover: Boolean = false,
    val coverUploadErrorDetail: String? = null,
    val saving: ArticleSaving? = null,
    val error: String? = null,
    val preview: Boolean = false,
)

private fun slugify(value: String): String =
    value.lowercase()
        .trim()
        .replace(Regex("[^a-z0-9\\s-]"), "")
        .replace(Regex("\\s+"), "-")
        .replace(Regex("-+"), "-")

/**
 * ZRP Journalist article editor - ported from ArticleEditorForm.tsx.
 * Shared by both create (articleId == null, POST /journalist/articles)
 * and edit (articleId != null, PATCH /journalist/articles/{id}), the
 * same real shape that component already shares between the website's
 * own new/edit pages.
 *
 * canSubmit is not modeled as a loaded/racy flag the way the website's
 * own server component passes it down: both native entry points into
 * this screen (JournalistDashboardScreen's Create Article button and
 * an article's own Edit link) are only ever reachable from the
 * VERIFIED-journalist dashboard body in the first place - the PENDING
 * and SUSPENDED dashboard states never render an article list or a
 * create button at all (see JournalistDashboardScreen). So by the time
 * this screen is reached, submitting for review is always allowed,
 * exactly the same real guarantee the website's own UI relies on
 * (its separate SUSPENDED-only redirect on the edit page's own server
 * component is defense in depth for a state this native screen simply
 * never lets you reach to begin with).
 *
 * Two real translated strings extracted for this screen go
 * deliberately unused as a result: journalist_editor_err_submit_restricted
 * (client-side "not verified" guard before submitting - unreachable
 * here since canSubmit is always true) and journalist_editor_submit_tooltip
 * (a hover-only tooltip shown on that same disabled state - no hover
 * affordance on touch, and the button is never disabled for this
 * reason natively either). A real submit failure from a status change
 * that happens to race the editor being open (e.g. suspended mid-edit)
 * still surfaces correctly via the server's own zrpErrorMessage().
 */
class ArticleEditorViewModel(
    private val articleId: String?,
    private val repository: JournalistRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(ArticleEditorUiState(isLoadingExisting = articleId != null))
    val state: StateFlow<ArticleEditorUiState> = _state.asStateFlow()

    val isEditMode: Boolean get() = articleId != null

    init {
        if (articleId != null) loadExisting(articleId)
    }

    private fun loadExisting(id: String) {
        viewModelScope.launch {
            repository.getArticle(id)
                .onSuccess { article ->
                    _state.update {
                        it.copy(
                            isLoadingExisting = false,
                            title = article.title,
                            slug = article.slug,
                            slugTouched = true,
                            excerpt = article.excerpt ?: "",
                            content = article.content,
                            coverImage = article.coverImage ?: "",
                            sourceName = article.sourceName ?: "",
                            sourceUrl = article.sourceUrl ?: "",
                            category = article.category,
                            existingStatus = article.status,
                            reviewNote = article.reviewNote,
                        )
                    }
                }
                .onFailure {
                    _state.update { it.copy(isLoadingExisting = false, notFound = true) }
                }
        }
    }

    fun onTitleChange(value: String) {
        _state.update {
            it.copy(title = value, slug = if (!it.slugTouched) slugify(value) else it.slug)
        }
    }

    fun onSlugChange(value: String) = _state.update { it.copy(slugTouched = true, slug = slugify(value)) }
    fun onExcerptChange(value: String) = _state.update { it.copy(excerpt = value) }
    fun onContentChange(value: String) = _state.update { it.copy(content = value) }
    fun onSourceNameChange(value: String) = _state.update { it.copy(sourceName = value) }
    fun onSourceUrlChange(value: String) = _state.update { it.copy(sourceUrl = value) }
    fun onCategoryChange(value: String) = _state.update { it.copy(category = value) }
    fun setPreview(show: Boolean) = _state.update { it.copy(preview = show) }
    fun dismissError() = _state.update { it.copy(error = null, coverUploadErrorDetail = null) }

    fun onCoverImagePicked(contentResolver: ContentResolver, uri: Uri, fileName: String, mimeType: String, size: Long) {
        _state.update { it.copy(uploadingCover = true, error = null, coverUploadErrorDetail = null) }
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
                _state.update { it.copy(uploadingCover = false, coverImage = uploaded.url) }
            }.onFailure { error ->
                _state.update { it.copy(uploadingCover = false, coverUploadErrorDetail = error.message ?: "") }
            }
        }
    }

    fun save(submit: Boolean, onSuccess: () -> Unit) {
        val s = _state.value
        val effectiveSlug = if (s.slugTouched) s.slug else slugify(s.title)
        if (s.title.isBlank()) {
            _state.update { it.copy(error = titleRequiredError) }
            return
        }
        if (effectiveSlug.isBlank()) {
            _state.update { it.copy(error = slugRequiredError) }
            return
        }
        if (s.content.isBlank()) {
            _state.update { it.copy(error = contentRequiredError) }
            return
        }

        _state.update { it.copy(saving = if (submit) ArticleSaving.SUBMIT else ArticleSaving.DRAFT, error = null) }
        viewModelScope.launch {
            val result = if (articleId != null) {
                repository.updateArticle(
                    id = articleId,
                    title = s.title.trim(),
                    slug = effectiveSlug.trim(),
                    excerpt = s.excerpt.trim().ifEmpty { null },
                    content = s.content.trim(),
                    coverImage = s.coverImage.trim().ifEmpty { null },
                    sourceName = s.sourceName.trim().ifEmpty { null },
                    sourceUrl = s.sourceUrl.trim().ifEmpty { null },
                    category = s.category,
                    submit = submit,
                )
            } else {
                repository.createArticle(
                    title = s.title.trim(),
                    slug = effectiveSlug.trim(),
                    excerpt = s.excerpt.trim().ifEmpty { null },
                    content = s.content.trim(),
                    coverImage = s.coverImage.trim().ifEmpty { null },
                    sourceName = s.sourceName.trim().ifEmpty { null },
                    sourceUrl = s.sourceUrl.trim().ifEmpty { null },
                    category = s.category,
                    submit = submit,
                )
            }
            result.onSuccess {
                _state.update { it.copy(saving = null) }
                onSuccess()
            }.onFailure { error ->
                _state.update { it.copy(saving = null, error = error.message ?: saveFailedError) }
            }
        }
    }

    companion object {
        const val titleRequiredError = "titleRequired"
        const val slugRequiredError = "slugRequired"
        const val contentRequiredError = "contentRequired"
        const val saveFailedError = "saveFailed"
    }
}

class ArticleEditorViewModelFactory(
    private val articleId: String?,
    private val repository: JournalistRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = ArticleEditorViewModel(articleId, repository) as T
}
