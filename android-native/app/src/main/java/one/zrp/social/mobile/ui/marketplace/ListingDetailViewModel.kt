package one.zrp.social.mobile.ui.marketplace

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MarketplaceRepository
import one.zrp.social.mobile.data.ZrpErrors
import one.zrp.social.mobile.network.ListingDetail
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

data class ListingDetailUiState(
    val isLoading: Boolean = true,
    val notFound: Boolean = false,
    // A genuine load failure (offline, timeout, 500) distinct from
    // notFound (a real 404 - the listing was deleted/never existed).
    // Both used to collapse into the same notFound=true branch, so a
    // transient network error showed the exact same "listing not
    // found, go back to marketplace" dead end as a real 404, with no
    // way to retry.
    val error: String? = null,
    val listing: ListingDetail? = null,
    val activeImageIndex: Int = 0,
    val favorited: Boolean = false,
    val favoriteCount: Int = 0,
    val ownUserId: String? = null,
    val isReportOpen: Boolean = false,
    val isReportSubmitting: Boolean = false,
    val reportError: String? = null,
    val message: String? = null,
)

/**
 * A single listing - the same real GET /listings/{id}, POST
 * /listings/{id}/favorite, and POST /reports (with listingId) routes
 * ListingDetailPage uses. Editing (owner-only) is a later native phase
 * once the create/edit listing screens exist, so the owner view here
 * stays read-only rather than linking to a screen that doesn't exist
 * yet.
 */
class ListingDetailViewModel(
    private val listingId: String,
    private val repository: MarketplaceRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ListingDetailUiState())
    val state: StateFlow<ListingDetailUiState> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, notFound = false, error = null) }
        viewModelScope.launch {
            repository.getListing(listingId)
                .onSuccess { listing ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            listing = listing,
                            favorited = listing.favorited,
                            favoriteCount = listing._count.favorites,
                            activeImageIndex = 0,
                        )
                    }
                }
                .onFailure { failure ->
                    if (isListingNotFound(failure)) {
                        _state.update { it.copy(isLoading = false, notFound = true) }
                    } else {
                        _state.update { it.copy(isLoading = false, error = listingLoadErrorMessage(failure)) }
                    }
                }
        }
    }

    fun refresh() = load()

    fun onImageSelect(index: Int) {
        _state.update { it.copy(activeImageIndex = index) }
    }

    fun onPreviousImage() {
        val listing = _state.value.listing ?: return
        val count = listing.imageUrls.size
        if (count == 0) return
        _state.update { it.copy(activeImageIndex = (it.activeImageIndex - 1 + count) % count) }
    }

    fun onNextImage() {
        val listing = _state.value.listing ?: return
        val count = listing.imageUrls.size
        if (count == 0) return
        _state.update { it.copy(activeImageIndex = (it.activeImageIndex + 1) % count) }
    }

    fun toggleFavorite() {
        val wasFavorited = _state.value.favorited
        _state.update {
            it.copy(
                favorited = !wasFavorited,
                favoriteCount = it.favoriteCount + if (wasFavorited) -1 else 1,
            )
        }
        viewModelScope.launch {
            repository.toggleFavorite(listingId).onFailure {
                _state.update {
                    it.copy(
                        favorited = wasFavorited,
                        favoriteCount = it.favoriteCount + if (wasFavorited) 1 else -1,
                    )
                }
            }
        }
    }

    fun onOpenReport() {
        _state.update { it.copy(isReportOpen = true, reportError = null) }
    }

    fun onCancelReport() {
        _state.update { it.copy(isReportOpen = false) }
    }

    fun submitReport(reason: String, details: String?) {
        _state.update { it.copy(isReportSubmitting = true, reportError = null) }
        viewModelScope.launch {
            repository.reportListing(listingId, reason, details)
                .onSuccess {
                    _state.update { it.copy(isReportSubmitting = false, isReportOpen = false, message = "reportSubmitted") }
                }
                .onFailure { error ->
                    _state.update { it.copy(isReportSubmitting = false, reportError = error.message) }
                }
        }
    }

    fun consumeMessage() {
        _state.update { it.copy(message = null) }
    }
}

class ListingDetailViewModelFactory(
    private val listingId: String,
    private val repository: MarketplaceRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ListingDetailViewModel(listingId, repository) as T
    }
}

/**
 * True only for a real 404 (the listing was deleted or never existed) -
 * every other failure (offline, timeout, a 500) is a transient load
 * error, not "not found", and should offer a retry rather than the
 * dead-end "go back to marketplace" message a 404 gets. Pulled out as a
 * pure function for direct JUnit coverage (same "plain JVM, build the
 * real Retrofit HttpException" pattern RepostFailureTest.kt already
 * established), since ListingDetailViewModel itself can't be
 * instantiated in this project's plain-JUnit test setup.
 */
internal fun isListingNotFound(failure: Throwable): Boolean = (failure as? HttpException)?.code() == 404

/** The message shown for a non-404 load failure - the server's own error text when there is one, else a generic network message. */
internal fun listingLoadErrorMessage(failure: Throwable): String =
    (failure as? HttpException)?.zrpErrorMessage() ?: ZrpErrors.NETWORK
